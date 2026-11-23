import path from 'node:path';
import { geometryBounds, type ArtifactManifest, type Generation, type MapLibreStyle } from '@map-exporter/contracts';
import type { AppConfig } from '../../config/config.js';
import type { EventBus } from '../../events/event-bus.js';
import { runGenerator } from '../../generator/generator-process.js';
import { GENERATOR_PROTOCOL_VERSION, type GeneratorMessage, type GeneratorRequest } from '../../generator/generator-protocol.js';
import type { Logger } from '../../shared/logging/logger.js';
import { ARTIFACT_FILES, type ArtifactService } from '../artifacts/artifacts.service.js';
import type { DatasetService } from '../dataset/dataset.service.js';
import { rowToGeneration, type GenerationRepository, type GenerationRow } from '../generations/generations.repository.js';
import { buildExportStyle } from './export-style.js';

export interface WorkerDeps {
  config: AppConfig;
  repo: GenerationRepository;
  artifacts: ArtifactService;
  dataset: DatasetService;
  bus: EventBus;
  logger: Logger;
}

const CANCEL_POLL_MS = 1000;

/**
 * Single-concurrency queue worker. Claims jobs with FOR UPDATE SKIP LOCKED, runs
 * the Rust generator as a child process, persists progress and publishes events.
 */
export class QueueWorker {
  private running = false;
  private stopRequested = false;
  private wake: (() => void) | null = null;
  private activeCancel: (() => void) | null = null;
  private activeJobId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: WorkerDeps) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    await this.recoverStaleJobs();
    this.unsubscribe = this.deps.bus.subscribe((event) => {
      if (event.type === 'generation.created' || event.type === 'queue.changed') this.wakeUp();
    });
    void this.loop();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.unsubscribe?.();
    this.wakeUp();
    // Mark the active job as interrupted; the generator is terminated gracefully.
    if (this.activeCancel && this.activeJobId) {
      this.deps.logger.warn({ jobId: this.activeJobId }, 'worker stopping, terminating active generation');
      this.activeCancel();
    }
    while (this.running) {
      await sleep(50);
    }
  }

  private wakeUp(): void {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  private async recoverStaleJobs(): Promise<void> {
    const failed = await this.deps.repo.failStaleActive('Worker was interrupted while the job was running');
    for (const job of failed) {
      this.deps.logger.warn({ jobId: job.id }, 'recovered stale active job as FAILED');
      await this.deps.artifacts.remove(job.id).catch(() => {});
      await this.deps.bus.publish({ type: 'generation.failed', data: job });
    }
    if (failed.length > 0) await this.publishQueueChanged();
  }

  private async loop(): Promise<void> {
    const { repo, logger, config } = this.deps;
    while (!this.stopRequested) {
      let row: GenerationRow | null = null;
      try {
        row = await repo.dequeue();
      } catch (err) {
        logger.error({ err }, 'dequeue failed');
      }
      if (!row) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          setTimeout(resolve, config.workerPollIntervalMs).unref();
        });
        continue;
      }
      try {
        await this.runJob(row);
      } catch (err) {
        logger.error({ err, jobId: row.id }, 'job runner crashed');
        await repo
          .transition(row.id, ['GENERATING', 'PACKAGING'], 'FAILED', {
            errorCode: 'WORKER_ERROR',
            error: (err as Error).message,
            completedAt: new Date(),
          })
          .then(async (g) => g && this.deps.bus.publish({ type: 'generation.failed', data: g }))
          .catch(() => {});
      }
    }
    this.running = false;
  }

  private async runJob(row: GenerationRow): Promise<void> {
    const { config, repo, artifacts, dataset, bus, logger } = this.deps;
    const jobId = row.id;
    const log = logger.child({ jobId });
    const startedAt = Date.now();
    this.activeJobId = jobId;

    const started = rowToGeneration(row);
    await bus.publish({ type: 'generation.started', data: started });
    await this.publishQueueChanged();

    await dataset.refresh();
    if (!dataset.isReady()) {
      await this.fail(jobId, 'DATASET_NOT_READY', 'Master dataset is not available to the worker');
      return;
    }

    const jobDir = await artifacts.prepareJobDir(jobId);
    const outputPath = path.join(jobDir, ARTIFACT_FILES.tiles);
    const isRaster = row.content_type === 'raster';
    const styleSnapshot = row.style_snapshot ?? null;

    const request: GeneratorRequest = {
      protocolVersion: GENERATOR_PROTOCOL_VERSION,
      jobId,
      source: { type: 'pmtiles', path: config.masterPmtiles },
      selection: { geometry: row.polygon, minZoom: row.min_zoom, maxZoom: row.max_zoom },
      output: {
        content: row.content_type,
        container: row.container_type,
        path: outputPath,
        rasterFormat: isRaster ? (row.raster_options?.format ?? 'png') : undefined,
        tileSize: isRaster ? (row.raster_options?.tileSize ?? 256) : undefined,
        metadata: {
          name: row.name,
          description: `${row.name} — ${row.content_type} export (z${row.min_zoom}–${row.max_zoom})`,
          attribution: '© OpenStreetMap contributors',
        },
      },
      style: isRaster ? styleSnapshot : null,
      renderer: isRaster
        ? { command: config.rasterRendererCommand, fontsDir: path.join(config.assetsDir, 'fonts') }
        : undefined,
      threads: config.generatorThreads,
    };

    let status: 'GENERATING' | 'PACKAGING' = 'GENERATING';
    let total = row.tile_count ?? 0;
    let completed = 0;
    let bytes = 0;
    let lastFlushedCompleted = -1;
    let flushTimer: NodeJS.Timeout | null = null;
    let lastFlushAt = 0;

    const flushProgress = async () => {
      if (completed === lastFlushedCompleted) return;
      lastFlushedCompleted = completed;
      lastFlushAt = Date.now();
      const elapsedMs = Date.now() - startedAt;
      const tilesPerSecond = elapsedMs > 0 ? (completed / elapsedMs) * 1000 : 0;
      const etaMs = tilesPerSecond > 0 && total > completed ? ((total - completed) / tilesPerSecond) * 1000 : null;
      await repo.updateProgress(jobId, completed, total).catch((err) => log.warn({ err }, 'progress persist failed'));
      await bus.publish({
        type: 'generation.progress',
        data: { id: jobId, completed, total, bytesWritten: bytes, tilesPerSecond, etaMs, elapsedMs },
      });
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      const wait = Math.max(0, config.progressThrottleMs - (Date.now() - lastFlushAt));
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushProgress();
      }, wait);
    };

    const onMessage = (msg: GeneratorMessage) => {
      switch (msg.type) {
        case 'started':
          total = msg.totalTiles;
          scheduleFlush();
          break;
        case 'progress':
          completed = msg.completed;
          total = msg.total || total;
          if (msg.bytes !== undefined) bytes = msg.bytes;
          scheduleFlush();
          break;
        case 'packaging':
          void (async () => {
            const g = await repo.transition(jobId, 'GENERATING', 'PACKAGING', { completedTiles: completed, tileCount: total });
            if (g) {
              status = 'PACKAGING';
              await bus.publish({ type: 'generation.packaging', data: g });
            }
          })();
          break;
        default:
          break;
      }
    };

    log.info({ content: row.content_type, tiles: total, zoom: [row.min_zoom, row.max_zoom] }, 'generation started');

    const handle = await runGenerator({
      binary: config.generatorBinary,
      request,
      requestDir: jobDir,
      logger: log,
      onMessage,
    });
    this.activeCancel = handle.cancel;

    let cancelRequested = false;
    const cancelPoll = setInterval(() => {
      void repo
        .isCancelRequested(jobId)
        .then((flag) => {
          if (flag && !cancelRequested) {
            cancelRequested = true;
            log.info('cancellation requested, terminating generator');
            handle.cancel();
          }
        })
        .catch(() => {});
    }, CANCEL_POLL_MS);

    const exit = await handle.done;
    clearInterval(cancelPoll);
    if (flushTimer) clearTimeout(flushTimer);
    this.activeCancel = null;
    this.activeJobId = null;

    const elapsedMs = Date.now() - startedAt;
    const last = exit.last;
    const interrupted = this.stopRequested;

    if (cancelRequested || interrupted || last?.type === 'cancelled') {
      await artifacts.remove(jobId).catch(() => {});
      const g = await repo.transition(jobId, ['GENERATING', 'PACKAGING'], interrupted ? 'FAILED' : 'CANCELLED', {
        completedTiles: completed,
        completedAt: new Date(),
        actualDurationMs: elapsedMs,
        errorCode: interrupted ? 'WORKER_INTERRUPTED' : null,
        error: interrupted ? 'Worker shut down while the job was running' : null,
      });
      if (g) await bus.publish({ type: interrupted ? 'generation.failed' : 'generation.cancelled', data: g });
      log.info({ elapsedMs }, interrupted ? 'generation interrupted' : 'generation cancelled');
      await this.publishQueueChanged();
      return;
    }

    if (last?.type === 'completed' && exit.exitCode === 0) {
      if (status === 'GENERATING') {
        const g = await repo.transition(jobId, 'GENERATING', 'PACKAGING', { completedTiles: last.tiles, tileCount: last.tiles });
        if (g) await bus.publish({ type: 'generation.packaging', data: g });
      }
      const actualSize = (await artifacts.tilesSize(jobId)) ?? last.bytes;
      const manifest: ArtifactManifest = {
        version: 1,
        jobId,
        name: row.name,
        content: row.content_type,
        container: row.container_type,
        raster: row.raster_options,
        minZoom: row.min_zoom,
        maxZoom: row.max_zoom,
        tileCount: last.tiles,
        bytes: actualSize,
        bounds: geometryBounds(row.polygon),
        datasetVersion: row.dataset_version,
        styleName: row.style_name,
        createdAt: row.created_at.toISOString(),
        completedAt: new Date().toISOString(),
        files: { tiles: ARTIFACT_FILES.tiles, style: ARTIFACT_FILES.style },
      };
      const exportStyle: MapLibreStyle | null = styleSnapshot
        ? buildExportStyle(styleSnapshot, { apiUrl: config.publicApiUrl, manifest })
        : null;
      await artifacts.writeBundle(jobId, manifest, exportStyle);

      const g = await repo.transition(jobId, 'PACKAGING', 'COMPLETED', {
        completedTiles: last.tiles,
        tileCount: last.tiles,
        actualSize,
        actualDurationMs: elapsedMs,
        completedAt: new Date(),
      });
      await repo
        .recordStats({
          generationId: jobId,
          content: row.content_type,
          rasterTileSize: row.raster_options?.tileSize ?? null,
          maxZoom: row.max_zoom,
          tileCount: last.tiles,
          bytes: actualSize,
          durationMs: elapsedMs,
        })
        .catch((err) => log.warn({ err }, 'stats persist failed'));
      if (g) await bus.publish({ type: 'generation.completed', data: g });
      log.info({ tiles: last.tiles, bytes: actualSize, elapsedMs }, 'generation completed');
      await this.publishQueueChanged();
      return;
    }

    const code = last?.type === 'failed' ? last.code : exit.exitCode === null ? 'GENERATOR_SPAWN_FAILED' : `GENERATOR_EXIT_${exit.exitCode}`;
    const message =
      last?.type === 'failed'
        ? last.message
        : exit.exitCode === null
          ? `Could not start generator at ${config.generatorBinary}: ${exit.stderrTail.trim().split('\n').pop() ?? ''}`
          : `Generator exited with code ${exit.exitCode}${exit.signal ? ` (${exit.signal})` : ''}`;
    await this.fail(jobId, code, message, { completedTiles: completed, actualDurationMs: elapsedMs });
    log.error({ code, message, stderr: exit.stderrTail.slice(-1000) }, 'generation failed');
  }

  private async fail(
    jobId: string,
    code: string,
    message: string,
    extra: { completedTiles?: number; actualDurationMs?: number } = {},
  ): Promise<void> {
    await this.deps.artifacts.remove(jobId).catch(() => {});
    const g = await this.deps.repo.transition(jobId, ['GENERATING', 'PACKAGING'], 'FAILED', {
      errorCode: code,
      error: message,
      completedAt: new Date(),
      ...extra,
    });
    if (g) await this.deps.bus.publish({ type: 'generation.failed', data: g });
    await this.publishQueueChanged();
  }

  private async publishQueueChanged(): Promise<void> {
    const [queued, current] = await Promise.all([this.deps.repo.queuedCount(), this.deps.repo.current()]);
    await this.deps.bus.publish({ type: 'queue.changed', data: { queued, currentId: current?.id ?? null } });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type { Generation };

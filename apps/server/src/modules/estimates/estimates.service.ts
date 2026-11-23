import fs from 'node:fs';
import type { Generation, GenerationEstimate, GenerationEstimateRequest, TileContent } from '@map-exporter/contracts';
import type { AppConfig } from '../../config/config.js';
import { runGeneratorEstimate } from '../../generator/generator-process.js';
import { GENERATOR_PROTOCOL_VERSION } from '../../generator/generator-protocol.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logging/logger.js';
import type { DatasetService } from '../dataset/dataset.service.js';
import type { GenerationRepository } from '../generations/generations.repository.js';

/** Per-tile SQLite overhead (row + unique index entry), empirically ~60–90 bytes. */
const SQLITE_OVERHEAD_PER_TILE = 80;
const SQLITE_BASE_BYTES = 32 * 1024;
const SAMPLE_LIMIT = 4000;

export interface RateModel {
  bytesPerTile: number;
  msPerTile: number;
  source: 'historical' | 'fallback';
  samples: number;
}

export class EstimateService {
  constructor(
    private readonly config: AppConfig,
    private readonly dataset: DatasetService,
    private readonly generations: GenerationRepository,
    private readonly logger: Logger,
  ) {}

  effectiveMaxZoom(): number {
    const datasetMax = this.dataset.maxZoom ?? 14;
    return this.config.maxZoomOverride !== null ? Math.min(this.config.maxZoomOverride, datasetMax) : datasetMax;
  }

  async rates(content: TileContent): Promise<RateModel> {
    const hist = await this.generations.stats(content).catch(() => null);
    if (hist && hist.samples >= 1 && hist.bytesPerTile > 0 && hist.msPerTile > 0) {
      return { bytesPerTile: hist.bytesPerTile, msPerTile: hist.msPerTile, source: 'historical', samples: hist.samples };
    }
    const f = this.config.estimateFallback;
    return content === 'vector'
      ? { bytesPerTile: f.vectorBytesPerTile, msPerTile: f.vectorMsPerTile, source: 'fallback', samples: 0 }
      : { bytesPerTile: f.rasterBytesPerTile, msPerTile: f.rasterMsPerTile, source: 'fallback', samples: 0 };
  }

  async estimate(request: GenerationEstimateRequest): Promise<GenerationEstimate> {
    await this.dataset.refresh();
    if (!this.dataset.isReady()) throw AppError.datasetNotReady();
    if (!fs.existsSync(this.config.generatorBinary)) {
      throw new AppError(
        'GENERATOR_UNAVAILABLE',
        `Generator binary not found at ${this.config.generatorBinary}. Run \`pnpm build:rust\`.`,
        503,
      );
    }

    const maxZoom = this.effectiveMaxZoom();
    const sampleLimit = request.content === 'vector' ? SAMPLE_LIMIT : 0;

    const result = await runGeneratorEstimate(
      this.config.generatorBinary,
      {
        protocolVersion: GENERATOR_PROTOCOL_VERSION,
        source: { type: 'pmtiles', path: this.config.masterPmtiles },
        selection: {
          geometry: request.selection.geometry,
          minZoom: request.minZoom,
          maxZoom: request.maxZoom,
        },
        sampleLimit,
      },
      this.logger,
    ).catch((err: Error) => {
      this.logger.warn({ err }, 'estimate failed');
      throw new AppError('ESTIMATE_FAILED', `Estimate failed: ${err.message}`, 500);
    });

    const rates = await this.rates(request.content);
    let estimatedBytes: number;
    let method: GenerationEstimate['method'];

    if (request.content === 'vector' && result.sampledTiles > 0) {
      const avg = result.sampledBytes / result.sampledTiles;
      estimatedBytes = Math.round(result.tiles * (avg + SQLITE_OVERHEAD_PER_TILE) + SQLITE_BASE_BYTES);
      method = result.exact ? 'exact-source' : 'sampled-source';
    } else {
      estimatedBytes = Math.round(result.tiles * (rates.bytesPerTile + SQLITE_OVERHEAD_PER_TILE) + SQLITE_BASE_BYTES);
      method = rates.source;
    }

    const estimatedGenerationMs = Math.round(result.tiles * rates.msPerTile) + 500;
    const estimatedQueueWaitMs = await this.queueWaitMs(null);

    return {
      tiles: result.tiles,
      estimatedBytes,
      estimatedGenerationMs,
      estimatedQueueWaitMs,
      estimatedReadyMs: estimatedQueueWaitMs + estimatedGenerationMs,
      method,
      tilesPerZoom: result.tilesPerZoom,
      limits: {
        maxTiles: this.config.maxExportTiles,
        maxZoom,
        exceedsTileLimit: result.tiles > this.config.maxExportTiles,
        exceedsZoomLimit: request.maxZoom > maxZoom,
      },
    };
  }

  /**
   * Queue wait for a job created at `createdAt` (null = a new job appended now):
   * remaining time of the running job + estimated durations of queued jobs ahead.
   */
  async queueWaitMs(createdAt: Date | null): Promise<number> {
    const [current, ahead] = await Promise.all([
      this.generations.current(),
      this.generations.queuedBefore(createdAt),
    ]);
    let total = current ? remainingMs(current) : 0;
    for (const job of ahead) {
      total += job.estimatedDurationMs ?? (await this.fallbackDuration(job));
    }
    return Math.max(0, Math.round(total));
  }

  private async fallbackDuration(job: Generation): Promise<number> {
    const rates = await this.rates(job.content);
    return (job.tileCount ?? 0) * rates.msPerTile;
  }
}

export function remainingMs(job: Generation, now = Date.now()): number {
  const started = job.startedAt ? Date.parse(job.startedAt) : now;
  const elapsed = Math.max(0, now - started);
  if (job.tileCount && job.completedTiles > 0) {
    const perTile = elapsed / job.completedTiles;
    return Math.max(0, (job.tileCount - job.completedTiles) * perTile);
  }
  if (job.estimatedDurationMs) return Math.max(0, job.estimatedDurationMs - elapsed);
  return 0;
}

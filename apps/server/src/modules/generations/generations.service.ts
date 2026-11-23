import { randomUUID } from 'node:crypto';
import {
  canTransition,
  geometryAreaKm2,
  isActiveStatus,
  type AuthUser,
  type Generation,
  type GenerationDetail,
  type GenerationListResponse,
  type GenerationRequest,
} from '@map-exporter/contracts';
import type { AppConfig } from '../../config/config.js';
import type { EventBus } from '../../events/event-bus.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logging/logger.js';
import type { AuthService } from '../auth/auth.service.js';
import type { ArtifactService } from '../artifacts/artifacts.service.js';
import type { DatasetService } from '../dataset/dataset.service.js';
import type { EstimateService } from '../estimates/estimates.service.js';
import { assertValidStyle } from '../styles/style-validation.js';
import type { GenerationRepository } from './generations.repository.js';

export class GenerationService {
  constructor(
    private readonly config: AppConfig,
    private readonly repo: GenerationRepository,
    private readonly artifacts: ArtifactService,
    private readonly estimates: EstimateService,
    private readonly dataset: DatasetService,
    private readonly bus: EventBus,
    private readonly logger: Logger,
    private readonly auth: AuthService,
  ) {}

  /** User-scoped list: only the caller's own jobs (status of their generation). */
  async listForUser(userId: string, historyLimit: number): Promise<GenerationListResponse> {
    const [current, queue, history] = await Promise.all([
      this.repo.current(userId),
      this.repo.queue(userId),
      this.repo.history(historyLimit, userId),
    ]);
    return { current, queue, history };
  }

  /** Admin global queue view. */
  async listAll(historyLimit: number): Promise<GenerationListResponse> {
    const [current, queue, history] = await Promise.all([
      this.repo.current(),
      this.repo.queue(),
      this.repo.history(historyLimit),
    ]);
    return { current, queue, history };
  }

  async get(id: string, actor?: AuthUser): Promise<GenerationDetail> {
    const generation = await this.repo.findById(id);
    if (!generation) throw AppError.notFound('Generation', id);
    this.assertOwns(generation, actor);
    return generation;
  }

  async create(request: GenerationRequest, user: AuthUser): Promise<Generation> {
    await this.dataset.refresh();
    if (!this.dataset.isReady()) throw AppError.datasetNotReady();

    const maxZoom = this.estimates.effectiveMaxZoom();
    if (request.maxZoom > maxZoom) {
      throw new AppError('ZOOM_LIMIT_EXCEEDED', `maxZoom ${request.maxZoom} exceeds dataset limit ${maxZoom}`, 400);
    }
    if (request.content === 'raster') assertValidStyle(request.style.styleSnapshot);

    const areaKm2 = geometryAreaKm2(request.selection.geometry);

    const estimate = await this.estimates.estimate({
      selection: request.selection,
      minZoom: request.minZoom,
      maxZoom: request.maxZoom,
      content: request.content,
      container: request.container,
      raster: request.raster,
    });
    if (estimate.tiles === 0) {
      throw new AppError('INVALID_GEOMETRY', 'Selection does not intersect any tile in the requested zoom range', 400);
    }
    if (estimate.limits.exceedsTileLimit) {
      throw new AppError(
        'TILE_LIMIT_EXCEEDED',
        `Generation of ${estimate.tiles.toLocaleString()} tiles exceeds the limit of ${this.config.maxExportTiles.toLocaleString()}`,
        400,
        { tiles: estimate.tiles, maxTiles: this.config.maxExportTiles },
      );
    }

    await this.auth.assertCanGenerate(user, estimate.tiles, areaKm2);

    const id = randomUUID();
    const generation = await this.repo.insert({
      id,
      name: request.name,
      polygon: request.selection.geometry,
      minZoom: request.minZoom,
      maxZoom: request.maxZoom,
      content: request.content,
      container: request.container,
      raster: request.content === 'raster' ? (request.raster ?? { format: 'png', tileSize: 256 }) : null,
      styleId: request.style.styleId ?? null,
      styleName: request.style.styleName,
      styleSnapshot: request.style.styleSnapshot,
      tileCount: estimate.tiles,
      estimatedSize: estimate.estimatedBytes,
      estimatedDurationMs: estimate.estimatedGenerationMs,
      datasetVersion: this.dataset.version,
      outputPath: this.artifacts.tilesPath(id),
      userId: user.id,
    });

    await this.auth.consumeGeneration(user.id);

    this.logger.info({ jobId: id, userId: user.id, tiles: estimate.tiles, content: request.content }, 'generation queued');
    await this.bus.publish({ type: 'generation.created', data: generation });
    await this.publishQueueChanged();
    return generation;
  }

  /** Builds a new QUEUED generation from the persisted snapshot of a FAILED/CANCELLED one. */
  async retry(id: string, user: AuthUser): Promise<Generation> {
    const source = await this.get(id, user);
    if (source.status !== 'FAILED' && source.status !== 'CANCELLED') {
      throw new AppError('INVALID_TRANSITION', `Only FAILED or CANCELLED generations can be retried (was ${source.status})`, 409);
    }
    if (!source.styleSnapshot) throw AppError.conflict('Generation has no style snapshot to retry with');
    return this.create(
      {
        name: source.name,
        selection: source.selection,
        minZoom: source.minZoom,
        maxZoom: source.maxZoom,
        content: source.content,
        container: source.container,
        raster: source.raster ?? undefined,
        style: {
          styleId: source.styleId,
          styleName: source.styleName ?? 'Style',
          styleSnapshot: source.styleSnapshot,
        },
      },
      user,
    );
  }

  /**
   * Cancels a QUEUED job immediately; for active jobs flags cancellation so the worker
   * terminates the generator and finalises the status.
   */
  async cancel(id: string, actor?: AuthUser): Promise<Generation> {
    const existing = await this.repo.findById(id);
    if (!existing) throw AppError.notFound('Generation', id);
    this.assertOwns(existing, actor);

    if (existing.status === 'QUEUED') {
      const updated = await this.repo.transition(id, 'QUEUED', 'CANCELLED', { completedAt: new Date() });
      if (!updated) return this.cancel(id, actor); // status changed under us – re-evaluate
      await this.bus.publish({ type: 'generation.cancelled', data: updated });
      await this.publishQueueChanged();
      return updated;
    }
    if (isActiveStatus(existing.status)) {
      await this.repo.requestCancel(id);
      return existing;
    }
    if (!canTransition(existing.status, 'CANCELLED')) {
      throw new AppError('INVALID_TRANSITION', `Cannot cancel generation in status ${existing.status}`, 409);
    }
    return existing;
  }

  /** Deletes the DB record and artifact directory. Active jobs are cancelled first. */
  async delete(id: string, actor?: AuthUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw AppError.notFound('Generation', id);
    this.assertOwns(existing, actor);
    if (isActiveStatus(existing.status)) {
      throw AppError.conflict('Cancel the running generation before deleting it');
    }
    if (existing.status === 'QUEUED') {
      await this.cancel(id, actor);
    }
    await this.artifacts.remove(id);
    await this.repo.delete(id);
    await this.bus.publish({ type: 'generation.deleted', data: { id } });
    await this.publishQueueChanged();
  }

  async publishQueueChanged(): Promise<void> {
    const [queued, current] = await Promise.all([this.repo.queuedCount(), this.repo.current()]);
    await this.bus.publish({ type: 'queue.changed', data: { queued, currentId: current?.id ?? null } });
  }

  private assertOwns(generation: Generation, actor?: AuthUser): void {
    if (!actor) return;
    if (actor.role === 'admin') return;
    if (generation.userId && generation.userId !== actor.id) {
      throw AppError.forbidden('You do not own this generation');
    }
  }
}

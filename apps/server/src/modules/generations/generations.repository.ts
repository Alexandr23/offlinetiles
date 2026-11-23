import {
  assertTransition,
  type ExportContainer,
  type Generation,
  type GenerationDetail,
  type GenerationStatus,
  type MapLibreStyle,
  type RasterOptions,
  type SelectionGeometry,
  type TileContent,
} from '@map-exporter/contracts';
import type { Db } from '../../db/client.js';

export interface GenerationRow {
  id: string;
  name: string;
  polygon: SelectionGeometry;
  min_zoom: number;
  max_zoom: number;
  content_type: TileContent;
  container_type: ExportContainer;
  raster_options: RasterOptions | null;
  style_id: string | null;
  style_name: string | null;
  style_snapshot?: MapLibreStyle | null;
  status: GenerationStatus;
  tile_count: number | null;
  completed_tiles: number;
  estimated_size: number | null;
  actual_size: number | null;
  estimated_duration_ms: number | null;
  actual_duration_ms: number | null;
  output_path: string | null;
  dataset_version: string | null;
  error_code: string | null;
  error: string | null;
  cancel_requested: boolean;
  user_id: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  queue_position?: number | string | null;
}

const LIST_COLUMNS = `
  id, name, polygon, min_zoom, max_zoom, content_type, container_type, raster_options,
  style_id, style_name, status, tile_count, completed_tiles, estimated_size, actual_size,
  estimated_duration_ms, actual_duration_ms, output_path, dataset_version, error_code, error,
  cancel_requested, user_id, created_at, started_at, completed_at
`;

export function rowToGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    name: row.name,
    selection: { geometry: row.polygon },
    minZoom: row.min_zoom,
    maxZoom: row.max_zoom,
    content: row.content_type,
    container: row.container_type,
    raster: row.raster_options,
    styleId: row.style_id,
    styleName: row.style_name,
    status: row.status,
    tileCount: row.tile_count,
    completedTiles: Number(row.completed_tiles ?? 0),
    estimatedSize: row.estimated_size,
    actualSize: row.actual_size,
    estimatedDurationMs: row.estimated_duration_ms,
    actualDurationMs: row.actual_duration_ms,
    hasArtifact: row.status === 'COMPLETED' && row.output_path !== null,
    datasetVersion: row.dataset_version,
    error: row.error_code || row.error ? { code: row.error_code ?? 'UNKNOWN', message: row.error ?? '' } : null,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    queuePosition:
      row.status === 'QUEUED' && row.queue_position !== undefined && row.queue_position !== null
        ? Number(row.queue_position)
        : null,
    userId: row.user_id ?? null,
  };
}

export interface NewGenerationRow {
  id: string;
  name: string;
  polygon: SelectionGeometry;
  minZoom: number;
  maxZoom: number;
  content: TileContent;
  container: ExportContainer;
  raster: RasterOptions | null;
  styleId: string | null;
  styleName: string | null;
  styleSnapshot: MapLibreStyle | null;
  tileCount: number | null;
  estimatedSize: number | null;
  estimatedDurationMs: number | null;
  datasetVersion: string | null;
  outputPath: string;
  userId: string | null;
}

export interface TransitionPatch {
  tileCount?: number | null;
  completedTiles?: number;
  actualSize?: number | null;
  actualDurationMs?: number | null;
  errorCode?: string | null;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export class GenerationRepository {
  constructor(private readonly db: Db) {}

  async insert(input: NewGenerationRow): Promise<Generation> {
    const rows = await this.db<GenerationRow[]>`
      INSERT INTO generations (
        id, name, polygon, min_zoom, max_zoom, content_type, container_type, raster_options,
        style_id, style_name, style_snapshot, status, tile_count, estimated_size,
        estimated_duration_ms, dataset_version, output_path, user_id
      ) VALUES (
        ${input.id}, ${input.name}, ${this.db.json(input.polygon as never)}, ${input.minZoom}, ${input.maxZoom},
        ${input.content}, ${input.container}, ${input.raster ? this.db.json(input.raster as never) : null},
        ${input.styleId}, ${input.styleName}, ${input.styleSnapshot ? this.db.json(input.styleSnapshot as never) : null},
        'QUEUED', ${input.tileCount}, ${input.estimatedSize}, ${input.estimatedDurationMs},
        ${input.datasetVersion}, ${input.outputPath}, ${input.userId}
      )
      RETURNING ${this.db.unsafe(LIST_COLUMNS)}
    `;
    const row = rows[0]!;
    const position = await this.queuePosition(row.id);
    return rowToGeneration({ ...row, queue_position: position });
  }

  async findById(id: string): Promise<GenerationDetail | null> {
    const rows = await this.db<GenerationRow[]>`
      SELECT ${this.db.unsafe(LIST_COLUMNS)}, style_snapshot,
        CASE WHEN status = 'QUEUED' THEN (
          SELECT COUNT(*) + 1 FROM generations q
          WHERE q.status = 'QUEUED' AND q.created_at < generations.created_at
        ) END AS queue_position
      FROM generations
      WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) return null;
    return { ...rowToGeneration(row), styleSnapshot: row.style_snapshot ?? null };
  }

  async findRow(id: string): Promise<GenerationRow | null> {
    const rows = await this.db<GenerationRow[]>`
      SELECT ${this.db.unsafe(LIST_COLUMNS)}, style_snapshot FROM generations WHERE id = ${id}
    `;
    return rows[0] ?? null;
  }

  async queuePosition(id: string): Promise<number | null> {
    const rows = await this.db<{ position: number | string }[]>`
      SELECT COUNT(*) + 1 AS position
      FROM generations q, generations me
      WHERE me.id = ${id} AND me.status = 'QUEUED'
        AND q.status = 'QUEUED' AND q.created_at < me.created_at
    `;
    const row = rows[0];
    return row ? Number(row.position) : null;
  }

  async current(userId?: string | null): Promise<Generation | null> {
    const rows = userId
      ? await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)} FROM generations
          WHERE status IN ('GENERATING', 'PACKAGING') AND user_id = ${userId}
          ORDER BY started_at ASC NULLS LAST
          LIMIT 1
        `
      : await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)} FROM generations
          WHERE status IN ('GENERATING', 'PACKAGING')
          ORDER BY started_at ASC NULLS LAST
          LIMIT 1
        `;
    return rows[0] ? rowToGeneration(rows[0]) : null;
  }

  async queue(userId?: string | null): Promise<Generation[]> {
    const rows = userId
      ? await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)},
            (
              SELECT COUNT(*) + 1 FROM generations q
              WHERE q.status = 'QUEUED' AND q.created_at < generations.created_at
            ) AS queue_position
          FROM generations
          WHERE status = 'QUEUED' AND user_id = ${userId}
          ORDER BY created_at ASC
        `
      : await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)},
            ROW_NUMBER() OVER (ORDER BY created_at ASC) AS queue_position
          FROM generations
          WHERE status = 'QUEUED'
          ORDER BY created_at ASC
        `;
    return rows.map(rowToGeneration);
  }

  async history(limit: number, userId?: string | null): Promise<Generation[]> {
    const rows = userId
      ? await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)} FROM generations
          WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED') AND user_id = ${userId}
          ORDER BY COALESCE(completed_at, created_at) DESC
          LIMIT ${limit}
        `
      : await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)} FROM generations
          WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED')
          ORDER BY COALESCE(completed_at, created_at) DESC
          LIMIT ${limit}
        `;
    return rows.map(rowToGeneration);
  }

  /**
   * Atomically claims the oldest QUEUED job and moves it to GENERATING.
   * Safe for multiple workers thanks to FOR UPDATE SKIP LOCKED.
   */
  async dequeue(): Promise<GenerationRow | null> {
    return this.db.begin(async (tx) => {
      const rows = await tx<GenerationRow[]>`
        SELECT ${tx.unsafe(LIST_COLUMNS)}, style_snapshot
        FROM generations
        WHERE status = 'QUEUED'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      const updated = await tx<GenerationRow[]>`
        UPDATE generations
        SET status = 'GENERATING', started_at = NOW(), completed_tiles = 0, error = NULL, error_code = NULL
        WHERE id = ${row.id} AND status = 'QUEUED'
        RETURNING ${tx.unsafe(LIST_COLUMNS)}, style_snapshot
      `;
      return updated[0] ?? null;
    });
  }

  /**
   * Conditional status update. Returns null when the row is not in `from` anymore
   * (e.g. it was cancelled concurrently), so callers can react.
   */
  async transition(
    id: string,
    from: GenerationStatus | GenerationStatus[],
    to: GenerationStatus,
    patch: TransitionPatch = {},
  ): Promise<Generation | null> {
    const fromList = Array.isArray(from) ? from : [from];
    for (const status of fromList) assertTransition(status, to);
    const rows = await this.db<GenerationRow[]>`
      UPDATE generations
      SET
        status = ${to},
        tile_count = ${patch.tileCount === undefined ? this.db`tile_count` : patch.tileCount},
        completed_tiles = ${patch.completedTiles === undefined ? this.db`completed_tiles` : patch.completedTiles},
        actual_size = ${patch.actualSize === undefined ? this.db`actual_size` : patch.actualSize},
        actual_duration_ms = ${patch.actualDurationMs === undefined ? this.db`actual_duration_ms` : patch.actualDurationMs},
        error_code = ${patch.errorCode === undefined ? this.db`error_code` : patch.errorCode},
        error = ${patch.error === undefined ? this.db`error` : patch.error},
        started_at = ${patch.startedAt === undefined ? this.db`started_at` : patch.startedAt},
        completed_at = ${patch.completedAt === undefined ? this.db`completed_at` : patch.completedAt}
      WHERE id = ${id} AND status IN ${this.db(fromList)}
      RETURNING ${this.db.unsafe(LIST_COLUMNS)}
    `;
    return rows[0] ? rowToGeneration(rows[0]) : null;
  }

  async updateProgress(id: string, completedTiles: number, tileCount?: number): Promise<void> {
    await this.db`
      UPDATE generations
      SET completed_tiles = ${completedTiles},
          tile_count = ${tileCount === undefined ? this.db`tile_count` : tileCount}
      WHERE id = ${id}
    `;
  }

  async requestCancel(id: string): Promise<boolean> {
    const rows = await this.db<{ id: string }[]>`
      UPDATE generations SET cancel_requested = TRUE
      WHERE id = ${id} AND status IN ('GENERATING', 'PACKAGING')
      RETURNING id
    `;
    return rows.length > 0;
  }

  async isCancelRequested(id: string): Promise<boolean> {
    const rows = await this.db<{ cancel_requested: boolean }[]>`
      SELECT cancel_requested FROM generations WHERE id = ${id}
    `;
    return rows[0]?.cancel_requested ?? false;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db<{ id: string }[]>`DELETE FROM generations WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }

  /** Crash recovery: any job left active by a dead worker is failed so it can be retried. */
  async failStaleActive(reason: string): Promise<Generation[]> {
    const rows = await this.db<GenerationRow[]>`
      UPDATE generations
      SET status = 'FAILED', error_code = 'WORKER_INTERRUPTED', error = ${reason}, completed_at = NOW()
      WHERE status IN ('GENERATING', 'PACKAGING')
      RETURNING ${this.db.unsafe(LIST_COLUMNS)}
    `;
    return rows.map(rowToGeneration);
  }

  async queuedCount(): Promise<number> {
    const rows = await this.db<{ count: number | string }[]>`
      SELECT COUNT(*) AS count FROM generations WHERE status = 'QUEUED'
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async queuedBefore(createdAt: Date | null): Promise<Generation[]> {
    const rows = createdAt
      ? await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)} FROM generations
          WHERE status = 'QUEUED' AND created_at < ${createdAt}
          ORDER BY created_at ASC
        `
      : await this.db<GenerationRow[]>`
          SELECT ${this.db.unsafe(LIST_COLUMNS)} FROM generations
          WHERE status = 'QUEUED'
          ORDER BY created_at ASC
        `;
    return rows.map(rowToGeneration);
  }

  async recordStats(input: {
    generationId: string;
    content: TileContent;
    rasterTileSize: number | null;
    maxZoom: number;
    tileCount: number;
    bytes: number;
    durationMs: number;
  }): Promise<void> {
    await this.db`
      INSERT INTO generation_stats (generation_id, content_type, raster_tile_size, max_zoom, tile_count, bytes, duration_ms)
      VALUES (${input.generationId}, ${input.content}, ${input.rasterTileSize}, ${input.maxZoom}, ${input.tileCount}, ${input.bytes}, ${input.durationMs})
      ON CONFLICT (generation_id) DO NOTHING
    `;
  }

  /** Weighted historical averages for the estimator (recent jobs first, up to `limit`). */
  async stats(content: TileContent, limit = 50): Promise<{ bytesPerTile: number; msPerTile: number; samples: number } | null> {
    const rows = await this.db<{ bytes_per_tile: string | number; ms_per_tile: string | number; samples: string | number }[]>`
      SELECT
        SUM(bytes)::float8 / NULLIF(SUM(tile_count), 0) AS bytes_per_tile,
        SUM(duration_ms)::float8 / NULLIF(SUM(tile_count), 0) AS ms_per_tile,
        COUNT(*) AS samples
      FROM (
        SELECT bytes, duration_ms, tile_count FROM generation_stats
        WHERE content_type = ${content} AND tile_count > 0
        ORDER BY created_at DESC
        LIMIT ${limit}
      ) recent
    `;
    const row = rows[0];
    if (!row || Number(row.samples) === 0 || row.bytes_per_tile === null) return null;
    return {
      bytesPerTile: Number(row.bytes_per_tile),
      msPerTile: Number(row.ms_per_tile),
      samples: Number(row.samples),
    };
  }
}

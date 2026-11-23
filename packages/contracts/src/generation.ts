import { z } from 'zod';
import {
  ExportContainerSchema,
  GenerationStatusSchema,
  RasterFormatSchema,
  TileContentSchema,
} from './enums.js';
import { AreaSelectionSchema } from './geojson.js';
import { MapLibreStyleSchema, StyleNameSchema } from './style.js';

export const GenerationNameSchema = z.string().trim().min(1).max(120);

export const ZoomSchema = z.number().int().min(0).max(22);

export const ZoomRangeSchema = z
  .object({
    minZoom: ZoomSchema,
    maxZoom: ZoomSchema,
  })
  .refine((v) => v.minZoom <= v.maxZoom, {
    message: 'minZoom must be <= maxZoom',
    path: ['minZoom'],
  });

export const RasterOptionsSchema = z.object({
  format: RasterFormatSchema.default('png'),
  tileSize: z.union([z.literal(256), z.literal(512)]).default(256),
});
export type RasterOptions = z.infer<typeof RasterOptionsSchema>;

/** Style attached to a generation request: id (optional) + name + full snapshot. */
export const GenerationStyleSchema = z.object({
  styleId: z.uuid().nullable().optional(),
  styleName: StyleNameSchema,
  styleSnapshot: MapLibreStyleSchema,
});
export type GenerationStyle = z.infer<typeof GenerationStyleSchema>;

const GenerationRequestBase = z.object({
  name: GenerationNameSchema,
  selection: AreaSelectionSchema,
  minZoom: ZoomSchema,
  maxZoom: ZoomSchema,
  content: TileContentSchema,
  container: ExportContainerSchema,
  raster: RasterOptionsSchema.optional(),
  style: GenerationStyleSchema,
});

export const GenerationRequestSchema = GenerationRequestBase.refine((v) => v.minZoom <= v.maxZoom, {
  message: 'minZoom must be <= maxZoom',
  path: ['minZoom'],
});
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

export const GenerationEstimateRequestSchema = z
  .object({
    selection: AreaSelectionSchema,
    minZoom: ZoomSchema,
    maxZoom: ZoomSchema,
    content: TileContentSchema,
    container: ExportContainerSchema.default('mbtiles'),
    raster: RasterOptionsSchema.optional(),
  })
  .refine((v) => v.minZoom <= v.maxZoom, {
    message: 'minZoom must be <= maxZoom',
    path: ['minZoom'],
  });
export type GenerationEstimateRequest = z.infer<typeof GenerationEstimateRequestSchema>;

export interface GenerationEstimate {
  tiles: number;
  estimatedBytes: number;
  estimatedGenerationMs: number;
  estimatedQueueWaitMs: number;
  estimatedReadyMs: number;
  /** How the byte estimate was derived. */
  method: 'exact-source' | 'sampled-source' | 'historical' | 'fallback';
  /** Tiles per zoom level, index = zoom. */
  tilesPerZoom: Record<string, number>;
  limits: {
    maxTiles: number;
    maxZoom: number;
    exceedsTileLimit: boolean;
    exceedsZoomLimit: boolean;
  };
}

export interface GenerationError {
  code: string;
  message: string;
}

export const GenerationSchema = z.object({
  id: z.uuid(),
  name: GenerationNameSchema,
  selection: AreaSelectionSchema,
  minZoom: ZoomSchema,
  maxZoom: ZoomSchema,
  content: TileContentSchema,
  container: ExportContainerSchema,
  raster: RasterOptionsSchema.nullable(),
  styleId: z.uuid().nullable(),
  styleName: z.string().nullable(),
  status: GenerationStatusSchema,
  tileCount: z.number().nullable(),
  completedTiles: z.number(),
  estimatedSize: z.number().nullable(),
  actualSize: z.number().nullable(),
  estimatedDurationMs: z.number().nullable(),
  actualDurationMs: z.number().nullable(),
  hasArtifact: z.boolean(),
  datasetVersion: z.string().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  /** 1-based FIFO position for QUEUED generations, otherwise null. Computed, never stored. */
  queuePosition: z.number().nullable(),
  /** Owner of the generation. Null for legacy rows created before auth. */
  userId: z.uuid().nullable(),
});
export type Generation = z.infer<typeof GenerationSchema>;

/** Detail view includes the immutable style snapshot. */
export interface GenerationDetail extends Generation {
  styleSnapshot: z.infer<typeof MapLibreStyleSchema> | null;
}

export interface GenerationProgress {
  id: string;
  completed: number;
  total: number;
  bytesWritten: number;
  tilesPerSecond: number;
  etaMs: number | null;
  elapsedMs: number;
}

export interface GenerationListResponse {
  current: Generation | null;
  queue: Generation[];
  history: Generation[];
}

export const GenerationListQuerySchema = z.object({
  historyLimit: z.coerce.number().int().min(1).max(500).default(100),
});

export interface ArtifactManifest {
  version: 1;
  jobId: string;
  name: string;
  content: z.infer<typeof TileContentSchema>;
  container: z.infer<typeof ExportContainerSchema>;
  raster: RasterOptions | null;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bytes: number;
  bounds: [number, number, number, number];
  datasetVersion: string | null;
  styleName: string | null;
  createdAt: string;
  completedAt: string;
  files: { tiles: string; style: string };
}

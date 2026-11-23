import { z } from 'zod';

export const GENERATION_STATUSES = [
  'QUEUED',
  'GENERATING',
  'PACKAGING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export const GenerationStatusSchema = z.enum(GENERATION_STATUSES);
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

export const ACTIVE_STATUSES: readonly GenerationStatus[] = ['GENERATING', 'PACKAGING'];
export const TERMINAL_STATUSES: readonly GenerationStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export const TILE_CONTENTS = ['vector', 'raster'] as const;
export const TileContentSchema = z.enum(TILE_CONTENTS);
export type TileContent = z.infer<typeof TileContentSchema>;

export const EXPORT_CONTAINERS = ['mbtiles'] as const;
export const ExportContainerSchema = z.enum(EXPORT_CONTAINERS);
export type ExportContainer = z.infer<typeof ExportContainerSchema>;

export const RASTER_FORMATS = ['png'] as const;
export const RasterFormatSchema = z.enum(RASTER_FORMATS);
export type RasterFormat = z.infer<typeof RasterFormatSchema>;

export const RASTER_TILE_SIZES = [256, 512] as const;
export type RasterTileSize = (typeof RASTER_TILE_SIZES)[number];

export function isActiveStatus(status: GenerationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminalStatus(status: GenerationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

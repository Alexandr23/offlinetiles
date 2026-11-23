import type { MapLibreStyle, RasterFormat, SelectionGeometry } from '@map-exporter/contracts';
import { z } from 'zod';

export const GENERATOR_PROTOCOL_VERSION = 1 as const;

/**
 * Request file handed to `tile-generator generate <request.json>`.
 * This is the versioned JSON boundary between Node and Rust. Changing it means
 * bumping `protocolVersion` and updating the Rust deserializer + fixtures.
 */
export interface GeneratorRequest {
  protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  jobId: string;
  source: { type: 'pmtiles'; path: string };
  selection: {
    geometry: SelectionGeometry;
    minZoom: number;
    maxZoom: number;
  };
  output: {
    content: 'vector' | 'raster';
    container: 'mbtiles';
    path: string;
    rasterFormat?: RasterFormat;
    tileSize?: number;
    metadata: {
      name: string;
      description?: string;
      attribution?: string;
    };
  };
  style: MapLibreStyle | null;
  renderer?: {
    command: string[];
    /** Where glyph pbfs live locally, e.g. /data/assets/fonts */
    fontsDir: string;
  };
  threads: number;
}

export interface GeneratorEstimateRequest {
  protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  source: { type: 'pmtiles'; path: string };
  selection: {
    geometry: SelectionGeometry;
    minZoom: number;
    maxZoom: number;
  };
  /** Max tiles whose byte size is read from the source. 0 disables sampling. */
  sampleLimit: number;
}

// ---- stdout protocol (JSON lines) ---------------------------------------

export const GeneratorMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), totalTiles: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('progress'),
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    bytes: z.number().nonnegative().optional(),
    elapsedMs: z.number().nonnegative().optional(),
  }),
  z.object({ type: z.literal('packaging') }),
  z.object({
    type: z.literal('completed'),
    tiles: z.number().int().nonnegative(),
    bytes: z.number().nonnegative(),
    elapsedMs: z.number().nonnegative().optional(),
  }),
  z.object({ type: z.literal('failed'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('cancelled') }),
]);

export type GeneratorMessage = z.infer<typeof GeneratorMessageSchema>;

export const GeneratorEstimateResultSchema = z.object({
  type: z.literal('estimate'),
  tiles: z.number().int().nonnegative(),
  tilesPerZoom: z.record(z.string(), z.number().int().nonnegative()),
  sampledTiles: z.number().int().nonnegative(),
  sampledBytes: z.number().nonnegative(),
  /** Tiles actually present in the source among the sampled ones. */
  sampledPresent: z.number().int().nonnegative(),
  exact: z.boolean(),
});
export type GeneratorEstimateResult = z.infer<typeof GeneratorEstimateResultSchema>;

export function parseGeneratorLine(line: string): GeneratorMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const parsed = GeneratorMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Incremental line splitter for child-process stdout chunks. */
export class LineBuffer {
  private rest = '';

  push(chunk: string | Buffer): string[] {
    this.rest += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const lines = this.rest.split('\n');
    this.rest = lines.pop() ?? '';
    return lines;
  }

  flush(): string[] {
    const r = this.rest;
    this.rest = '';
    return r.length > 0 ? [r] : [];
  }
}

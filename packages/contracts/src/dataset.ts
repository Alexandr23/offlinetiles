import { z } from 'zod';

export const DatasetSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('region'), region: z.string().min(1) }),
  z.object({ type: z.literal('planet') }),
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
]);
export type DatasetSource = z.infer<typeof DatasetSourceSchema>;

/** Persisted as /data/master/dataset.json by the init CLI. */
export const DatasetManifestSchema = z.object({
  status: z.enum(['ready', 'building', 'failed']),
  version: z.string(),
  source: DatasetSourceSchema,
  tiles: z.object({
    path: z.string(),
    schema: z.literal('openmaptiles'),
  }),
  createdAt: z.string(),
  planetiler: z
    .object({
      runner: z.enum(['docker', 'jar']),
      image: z.string().optional(),
      jar: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
});
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;

export interface DatasetVectorLayer {
  id: string;
  fields?: Record<string, string>;
  minzoom?: number;
  maxzoom?: number;
}

export type DatasetInfo =
  | {
      ready: true;
      version: string;
      source: string;
      sourceDetail: DatasetSource;
      minZoom: number;
      maxZoom: number;
      bounds: [number, number, number, number];
      center: [number, number, number];
      tileCompression: string;
      vectorLayers: DatasetVectorLayer[];
      tileUrlTemplate: string;
      glyphsUrlTemplate: string | null;
      createdAt: string;
      sizeBytes: number;
    }
  | {
      ready: false;
      reason: 'missing' | 'building' | 'failed' | 'invalid';
      message: string;
    };

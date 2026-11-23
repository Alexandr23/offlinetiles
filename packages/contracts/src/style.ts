import { z } from 'zod';

/**
 * MapLibre Style Specification v8 is the canonical persisted style representation.
 * We validate structure here; deep spec validation happens with
 * @maplibre/maplibre-gl-style-spec on the server and in the editor.
 */
export const MapLibreStyleSchema = z
  .object({
    version: z.literal(8),
    name: z.string().max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    sources: z.record(z.string(), z.record(z.string(), z.unknown())),
    sprite: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]).optional(),
    glyphs: z.string().optional(),
    layers: z.array(z.record(z.string(), z.unknown())).max(2000),
    center: z.array(z.number()).optional(),
    zoom: z.number().optional(),
    bearing: z.number().optional(),
    pitch: z.number().optional(),
    light: z.record(z.string(), z.unknown()).optional(),
    terrain: z.record(z.string(), z.unknown()).optional(),
    sky: z.record(z.string(), z.unknown()).optional(),
    projection: z.record(z.string(), z.unknown()).optional(),
    transition: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type MapLibreStyle = z.infer<typeof MapLibreStyleSchema>;

export const StyleNameSchema = z.string().trim().min(1).max(80);

export const MapStyleSchema = z.object({
  id: z.uuid(),
  name: StyleNameSchema,
  basePreset: z.string().max(80).nullable(),
  style: MapLibreStyleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Owner of the style. Null for legacy rows created before per-user styles. */
  userId: z.uuid().nullable(),
});
export type MapStyle = z.infer<typeof MapStyleSchema>;

export const CreateStyleRequestSchema = z.object({
  name: StyleNameSchema,
  basePreset: z.string().max(80).nullable().optional(),
  style: MapLibreStyleSchema,
});
export type CreateStyleRequest = z.infer<typeof CreateStyleRequestSchema>;

export const UpdateStyleRequestSchema = z
  .object({
    name: StyleNameSchema.optional(),
    style: MapLibreStyleSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.style !== undefined, {
    message: 'nothing to update',
  });
export type UpdateStyleRequest = z.infer<typeof UpdateStyleRequestSchema>;

export const DuplicateStyleRequestSchema = z.object({
  name: StyleNameSchema.optional(),
});
export type DuplicateStyleRequest = z.infer<typeof DuplicateStyleRequestSchema>;

export const PRESET_IDS = ['light', 'dark', 'streets', 'minimal', 'outdoor'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** Reference to either a built-in preset or a saved style. */
export const StyleRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), presetId: z.enum(PRESET_IDS) }),
  z.object({ kind: z.literal('saved'), styleId: z.uuid() }),
]);
export type StyleRef = z.infer<typeof StyleRefSchema>;

import { z } from 'zod';

const PositionSchema = z
  .array(z.number().finite())
  .min(2)
  .max(3)
  .refine((p) => p[0]! >= -180 && p[0]! <= 180, { message: 'longitude out of range' })
  .refine((p) => p[1]! >= -90 && p[1]! <= 90, { message: 'latitude out of range' });

const LinearRingSchema = z
  .array(PositionSchema)
  .min(4, 'a linear ring needs at least 4 positions')
  .refine(
    (ring) => {
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      return first[0] === last[0] && first[1] === last[1];
    },
    { message: 'linear ring must be closed' },
  );

export const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(LinearRingSchema).min(1).max(64),
});

export const MultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(LinearRingSchema).min(1).max(64)).min(1).max(256),
});

export const SelectionGeometrySchema = z.discriminatedUnion('type', [PolygonSchema, MultiPolygonSchema]);

export type Position = number[];
export type Polygon = z.infer<typeof PolygonSchema>;
export type MultiPolygon = z.infer<typeof MultiPolygonSchema>;
export type SelectionGeometry = z.infer<typeof SelectionGeometrySchema>;

/** [west, south, east, north] */
export type BBox = [number, number, number, number];

export const AreaSelectionSchema = z.object({
  geometry: SelectionGeometrySchema,
});
export type AreaSelection = z.infer<typeof AreaSelectionSchema>;

export function geometryBounds(geometry: SelectionGeometry): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const rings: Position[][] =
    geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(1);
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x! < west) west = x!;
      if (x! > east) east = x!;
      if (y! < south) south = y!;
      if (y! > north) north = y!;
    }
  }
  return [west, south, east, north];
}

export function bboxToPolygon(bbox: BBox): Polygon {
  const [w, s, e, n] = bbox;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

const EARTH_RADIUS_M = 6378137;

/** Approximate spherical area in km² (shoelace on the sphere). */
export function geometryAreaKm2(geometry: SelectionGeometry): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const rings of polygons) {
    rings.forEach((ring, index) => {
      const a = ringArea(ring);
      total += index === 0 ? a : -a;
    });
  }
  return Math.abs(total) / 1_000_000;
}

function ringArea(ring: Position[]): number {
  if (ring.length < 3) return 0;
  let area = 0;
  const rad = (d: number) => (d * Math.PI) / 180;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[i + 1]!;
    area += rad(p2[0]! - p1[0]!) * (2 + Math.sin(rad(p1[1]!)) + Math.sin(rad(p2[1]!)));
  }
  return (area * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

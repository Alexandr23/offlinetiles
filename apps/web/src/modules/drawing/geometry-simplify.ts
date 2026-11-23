import type { Polygon, Position, SelectionGeometry } from '@map-exporter/contracts';

/**
 * Soft cap only for pathological geometries. Country polygons from NE 10m are
 * kept near-full detail (build soft-caps ~12k verts) so coasts stay accurate.
 */
export const EDIT_VERTEX_BUDGET = 12_000;

/** Above this, midpoints are disabled — they roughly double editable handles. */
export const MIDPOINT_VERTEX_LIMIT = 64;

function sqSegDist(p: Position, a: Position, b: Position): number {
  let x = a[0]!;
  let y = a[1]!;
  let dx = b[0]! - x;
  let dy = b[1]! - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0]! - x) * dx + (p[1]! - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0]!;
      y = b[1]!;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0]! - x;
  dy = p[1]! - y;
  return dx * dx + dy * dy;
}

/** Douglas–Peucker simplification for a closed linear ring. */
export function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 4 || tolerance <= 0) return ring.map((c) => [c[0]!, c[1]!]);

  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;

  const douglas = (first: number, last: number) => {
    let maxSq = 0;
    let index = -1;
    const a = ring[first]!;
    const b = ring[last]!;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(ring[i]!, a, b);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (maxSq > sqTol && index !== -1) {
      keep[index] = 1;
      douglas(first, index);
      douglas(index, last);
    }
  };
  douglas(0, ring.length - 1);

  const out: Position[] = [];
  for (let i = 0; i < ring.length; i++) {
    if (keep[i]) out.push([ring[i]![0]!, ring[i]![1]!]);
  }
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0]!, first[1]!]);
  return out.length >= 4 ? out : ring.map((c) => [c[0]!, c[1]!]);
}

function ringAreaAbs(ring: Position[]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
  }
  return Math.abs(a / 2);
}

function simplifyPolygonCoords(coords: Position[][], tolerance: number): Position[][] {
  const rings = coords
    .map((ring) => simplifyRing(ring, tolerance))
    .filter((ring) => ring.length >= 4);
  if (!rings.length) return coords.map((r) => r.map((c) => [c[0]!, c[1]!]));
  if (rings.length <= 9) return rings;
  const outer = rings[0]!;
  const holes = rings
    .slice(1)
    .sort((a, b) => ringAreaAbs(b) - ringAreaAbs(a))
    .slice(0, 8);
  return [outer, ...holes];
}

function countVertices(geometry: SelectionGeometry): number {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(1);
  return rings.reduce((n, ring) => n + Math.max(0, ring.length - 1), 0);
}

/**
 * Reduce vertex count for interactive editing while preserving topology enough
 * for export. Returns the original geometry when already under budget.
 */
export function simplifyForEditing(
  geometry: SelectionGeometry,
  maxVertices = EDIT_VERTEX_BUDGET,
): SelectionGeometry {
  if (countVertices(geometry) <= maxVertices) return geometry;

  let tolerance = 0.01;
  let current = geometry;

  for (let pass = 0; pass < 12; pass++) {
    if (current.type === 'Polygon') {
      current = {
        type: 'Polygon',
        coordinates: simplifyPolygonCoords(current.coordinates, tolerance),
      };
    } else {
      const parts = current.coordinates
        .map((poly) => ({
          coords: simplifyPolygonCoords(poly, tolerance),
          area: ringAreaAbs(poly[0] ?? []),
        }))
        .filter((p) => p.coords.length > 0)
        .sort((a, b) => b.area - a.area)
        .slice(0, 32)
        .map((p) => p.coords);

      current =
        parts.length === 1
          ? { type: 'Polygon', coordinates: parts[0]! }
          : { type: 'MultiPolygon', coordinates: parts };
    }

    if (countVertices(current) <= maxVertices) return current;
    tolerance *= 1.7;
  }

  return current;
}

export { countVertices as geometryVertexCount };

/** Split selection geometry into Polygon features (one per MultiPolygon part). */
export function polygonParts(geometry: SelectionGeometry): Polygon[] {
  return geometry.type === 'Polygon'
    ? [geometry]
    : geometry.coordinates.map((c) => ({ type: 'Polygon' as const, coordinates: c }));
}

/**
 * Terra Draw rejects polygons with holes (`Feature has holes`). Countries like UAE
 * store enclaves as interior rings — keep those in the selection store for export,
 * but only feed exterior rings into Terra Draw so the mainland actually renders.
 */
export function polygonPartsForDraw(geometry: SelectionGeometry): Polygon[] {
  return polygonParts(geometry).map((polygon) => ({
    type: 'Polygon' as const,
    coordinates: [polygon.coordinates[0]!],
  }));
}

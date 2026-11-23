import { describe, expect, it } from 'vitest';
import { GENERATION_STATUSES } from './enums.js';
import { allowedTransitions, assertTransition, canTransition } from './transitions.js';
import { bboxToPolygon, geometryAreaKm2, geometryBounds, SelectionGeometrySchema } from './geojson.js';
import { GenerationRequestSchema } from './generation.js';

describe('generation state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('QUEUED', 'GENERATING')).toBe(true);
    expect(canTransition('GENERATING', 'PACKAGING')).toBe(true);
    expect(canTransition('PACKAGING', 'COMPLETED')).toBe(true);
  });

  it('allows cancellation and failure from active states', () => {
    expect(canTransition('QUEUED', 'CANCELLED')).toBe(true);
    expect(canTransition('GENERATING', 'FAILED')).toBe(true);
    expect(canTransition('GENERATING', 'CANCELLED')).toBe(true);
    expect(canTransition('PACKAGING', 'FAILED')).toBe(true);
    expect(canTransition('PACKAGING', 'CANCELLED')).toBe(true);
  });

  it('rejects skipping and backwards moves', () => {
    expect(canTransition('QUEUED', 'COMPLETED')).toBe(false);
    expect(canTransition('QUEUED', 'FAILED')).toBe(false);
    expect(canTransition('GENERATING', 'QUEUED')).toBe(false);
    expect(canTransition('COMPLETED', 'GENERATING')).toBe(false);
    expect(() => assertTransition('FAILED', 'QUEUED')).toThrow(/Invalid generation status transition/);
  });

  it('terminal states have no outgoing transitions', () => {
    for (const s of ['COMPLETED', 'FAILED', 'CANCELLED'] as const) {
      expect(allowedTransitions(s)).toEqual([]);
    }
    expect(GENERATION_STATUSES).toHaveLength(6);
  });
});

describe('geojson helpers', () => {
  const square = bboxToPolygon([7.4, 43.7, 7.45, 43.75]);

  it('validates closed rings', () => {
    expect(SelectionGeometrySchema.safeParse(square).success).toBe(true);
    const open = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] };
    expect(SelectionGeometrySchema.safeParse(open).success).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    const bad = bboxToPolygon([-200, 0, 10, 10]);
    expect(SelectionGeometrySchema.safeParse(bad).success).toBe(false);
  });

  it('computes bounds and area', () => {
    expect(geometryBounds(square)).toEqual([7.4, 43.7, 7.45, 43.75]);
    const km2 = geometryAreaKm2(square);
    // ~4.0km x ~5.6km
    expect(km2).toBeGreaterThan(20);
    expect(km2).toBeLessThan(25);
  });
});

describe('generation request validation', () => {
  const base = {
    name: 'Monaco',
    selection: { geometry: bboxToPolygon([7.4, 43.7, 7.45, 43.75]) },
    minZoom: 8,
    maxZoom: 14,
    content: 'vector',
    container: 'mbtiles',
    style: {
      styleId: null,
      styleName: 'Light',
      styleSnapshot: { version: 8, sources: {}, layers: [] },
    },
  };

  it('accepts a valid request', () => {
    expect(GenerationRequestSchema.safeParse(base).success).toBe(true);
  });

  it('rejects inverted zoom range', () => {
    const r = GenerationRequestSchema.safeParse({ ...base, minZoom: 14, maxZoom: 8 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown content/container enums', () => {
    expect(GenerationRequestSchema.safeParse({ ...base, content: 'mbtiles' }).success).toBe(false);
    expect(GenerationRequestSchema.safeParse({ ...base, container: 'zip' }).success).toBe(false);
  });
});

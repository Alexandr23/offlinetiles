import { describe, expect, it } from 'vitest';
import { geometryVertexCount, simplifyForEditing, simplifyRing } from './geometry-simplify';

function denseRing(n: number) {
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    ring.push([Math.cos(t) * 10, Math.sin(t) * 10]);
  }
  ring.push(ring[0]!);
  return ring;
}

describe('geometry simplify', () => {
  it('simplifyRing keeps endpoints and reduces points', () => {
    const ring = denseRing(200);
    const simplified = simplifyRing(ring, 0.5);
    expect(simplified.length).toBeLessThan(ring.length);
    expect(simplified.length).toBeGreaterThanOrEqual(4);
    expect(simplified[0]).toEqual(simplified[simplified.length - 1]);
  });

  it('simplifyForEditing caps vertex budget on dense polygons', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [denseRing(1200)],
    };
    expect(geometryVertexCount(geometry)).toBeGreaterThan(800);
    const simplified = simplifyForEditing(geometry, 120);
    expect(geometryVertexCount(simplified)).toBeLessThanOrEqual(120);
  });

  it('leaves already-simple geometry unchanged', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    expect(simplifyForEditing(geometry)).toBe(geometry);
  });
});

import { describe, expect, it } from 'vitest';
import { coverTiles, gridPath, polygonPath, type Point } from './tile-geometry';

describe('tile geometry', () => {
  it('sorts tiles into edge, inside and untouched', () => {
    // A square from the middle of tile (0,0) to the middle of tile (2,2) on a 4x4 grid of 10px tiles.
    const square: Point[] = [
      [5, 5],
      [25, 5],
      [25, 25],
      [5, 25],
    ];
    const { edge, inside } = coverTiles(square, 4, 4, 10);
    expect(inside).toEqual([[10, 10]]);
    expect(edge).toHaveLength(8);
    expect(edge).not.toContainEqual([30, 0]);
    expect(edge).not.toContainEqual([10, 10]);
  });

  it('builds SVG paths', () => {
    expect(
      polygonPath([
        [0, 0],
        [4, 0],
        [4, 3],
      ]),
    ).toBe('M0 0L4 0L4 3Z');
    expect(gridPath(1, 1, 8)).toBe('M0 0V8M8 0V8M0 0H8M0 8H8');
  });
});

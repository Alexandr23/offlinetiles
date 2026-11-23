import { describe, expect, it } from 'vitest';
import { polygonPartsForDraw } from './geometry-simplify';

describe('polygonPartsForDraw', () => {
  it('drops interior rings so Terra Draw can accept holed countries like UAE', () => {
    const parts = polygonPartsForDraw({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [51, 22],
            [56, 22],
            [56, 26],
            [51, 26],
            [51, 22],
          ],
          [
            [54, 24],
            [55, 24],
            [55, 25],
            [54, 24],
          ],
        ],
        [
          [
            [53, 24],
            [54, 24],
            [54, 25],
            [53, 24],
          ],
        ],
      ],
    });

    expect(parts).toHaveLength(2);
    expect(parts[0]!.coordinates).toHaveLength(1);
    expect(parts[0]!.coordinates[0]).toHaveLength(5);
    expect(parts[1]!.coordinates).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { selectionVerticesCollection } from './selection-vertices';

describe('selectionVerticesCollection', () => {
  it('emits one point per ring vertex, dropping the closing duplicate', () => {
    const collection = selectionVerticesCollection({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    });
    expect(collection.features).toHaveLength(4);
    expect(collection.features.map((f) => f.geometry.coordinates)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it('includes vertices from every MultiPolygon part', () => {
    const collection = selectionVerticesCollection({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 5],
          ],
        ],
      ],
    });
    expect(collection.features).toHaveLength(6);
  });

  it('returns an empty collection for null', () => {
    expect(selectionVerticesCollection(null).features).toHaveLength(0);
  });
});

/** Geometry for the landing diagrams: a polygon laid over a grid of square tiles, in SVG units. */

export type Point = readonly [number, number];

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segmentsCross = (a: Point, b: Point, c: Point, d: Point) =>
  cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

const contains = (polygon: readonly Point[], [x, y]: Point) =>
  polygon.reduce((inside, a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const crossesRay = a[1] > y !== b[1] > y && x < a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    return crossesRay ? !inside : inside;
  }, false);

export const polygonPath = (polygon: readonly Point[]) => `M${polygon.map((p) => p.join(' ')).join('L')}Z`;

/** The lines of a `cols` by `rows` grid, outer border included. */
export function gridPath(cols: number, rows: number, size: number): string {
  return [
    ...Array.from({ length: cols + 1 }, (_, i) => `M${i * size} 0V${rows * size}`),
    ...Array.from({ length: rows + 1 }, (_, i) => `M0 ${i * size}H${cols * size}`),
  ].join('');
}

export interface TileCover {
  /** Top-left corners of the tiles the polygon's edge passes through. */
  edge: Point[];
  /** Top-left corners of the tiles that lie wholly inside the polygon. */
  inside: Point[];
}

/** Sorts the tiles of a grid by how the polygon meets them. Tiles it does not touch are left out. */
export function coverTiles(polygon: readonly Point[], cols: number, rows: number, size: number): TileCover {
  const cover: TileCover = { edge: [], inside: [] };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * size;
      const y = row * size;
      const corners: Point[] = [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
      ];
      const onEdge = polygon.some((p, i) => {
        const q = polygon[(i + 1) % polygon.length]!;
        const holdsVertex = p[0] > x && p[0] < x + size && p[1] > y && p[1] < y + size;
        return holdsVertex || corners.some((c, k) => segmentsCross(p, q, c, corners[(k + 1) % 4]!));
      });
      if (onEdge) cover.edge.push([x, y]);
      else if (contains(polygon, [x + size / 2, y + size / 2])) cover.inside.push([x, y]);
    }
  }
  return cover;
}

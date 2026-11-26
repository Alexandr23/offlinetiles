/**
 * Slide backdrop: a pyramid of map tiles. The biggest tiles sit in the bottom-left corner and
 * they halve in size, and fade, towards the top-right, like zoom levels of a tile pyramid.
 *
 * Built once as an SVG data URI and used as a CSS background, so it needs no markup.
 */

export const BACKDROP_W = 1600;
export const BACKDROP_H = 1000;
const W = BACKDROP_W;
const H = BACKDROP_H;
/** Side of the root square: a power of two, so every tile is a clean quadtree cell. */
const ROOT = 2048;
const MIN_TILE = 32;
/** Target tile size at the corner; the real tiles are the quadtree cells just under it. */
const BIG_TILE = 160;
/** Distance from the corner over which tile sizes shrink from BIG_TILE to MIN_TILE. */
const SIZE_REACH = 1700;
/** Distance from the corner at which the pattern has faded out: about half way along the diagonal. */
export const BACKDROP_FADE_REACH = 900;
const FADE_REACH = BACKDROP_FADE_REACH;

const STROKE = '#94B0CC';
const ACCENT = '#4FD1FF';

/** Wanted tile size at distance d from the bottom-left corner: shrinks as d grows. */
function targetSize(d: number): number {
  const k = Math.max(0, 1 - d / SIZE_REACH);
  return Math.max(MIN_TILE, BIG_TILE * k ** 1.6);
}

/** Stable pseudo-random 0..99 for a tile, so the same tiles are tinted on every load. */
function dice(x: number, y: number, s: number): number {
  const h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(s, 83492791);
  return (h >>> 0) % 100;
}

/** Every visible tile as [x, y, size], in backdrop coordinates. */
function tiles(): [number, number, number][] {
  const out: [number, number, number][] = [];
  const visit = (x: number, y: number, s: number): void => {
    if (x >= W || y >= H || x + s <= 0 || y + s <= 0) return;
    const d = Math.hypot(x + s / 2, y + s / 2 - H);
    if (s > MIN_TILE && s > targetSize(d)) {
      const h = s / 2;
      visit(x, y, h);
      visit(x + h, y, h);
      visit(x, y + h, h);
      visit(x + h, y + h, h);
      return;
    }
    if (d > FADE_REACH) return;
    out.push([x, y, s]);
  };
  visit(0, H - ROOT, ROOT);
  return out;
}

export type Point = readonly [number, number];

/**
 * The tile outlines as a graph: every node is a tile corner, every edge a piece of line between
 * two neighbouring corners. Lines are split wherever a smaller tile touches them, so a walker
 * can turn at every junction.
 */
export function buildGridGraph(): Map<string, Point[]> {
  const cells = tiles();
  const key = (x: number, y: number) => `${x},${y}`;
  const xsAtY = new Map<number, Set<number>>();
  const ysAtX = new Map<number, Set<number>>();
  const add = (m: Map<number, Set<number>>, a: number, b: number) => {
    let set = m.get(a);
    if (!set) m.set(a, (set = new Set()));
    set.add(b);
  };
  for (const [x, y, s] of cells) {
    for (const [px, py] of [
      [x, y],
      [x + s, y],
      [x, y + s],
      [x + s, y + s],
    ] as const) {
      add(xsAtY, py, px);
      add(ysAtX, px, py);
    }
  }

  const graph = new Map<string, Point[]>();
  const link = (a: Point, b: Point) => {
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      const k = key(p[0], p[1]);
      const list = graph.get(k) ?? [];
      if (!list.some((n) => n[0] === q[0] && n[1] === q[1])) list.push(q);
      graph.set(k, list);
    }
  };

  for (const [x, y, s] of cells) {
    const sides: [number, number, boolean][] = [
      [x, y, true],
      [x, y + s, true],
      [x, y, false],
      [x + s, y, false],
    ];
    for (const [sx, sy, horizontal] of sides) {
      const fixed = horizontal ? sy : sx;
      const from = horizontal ? sx : sy;
      const stops = [...((horizontal ? xsAtY : ysAtX).get(fixed) ?? [])]
        .filter((v) => v >= from && v <= from + s)
        .sort((a, b) => a - b);
      for (let i = 1; i < stops.length; i++) {
        const s0 = stops[i - 1]!;
        const s1 = stops[i]!;
        const a: Point = horizontal ? [s0, fixed] : [fixed, s0];
        const b: Point = horizontal ? [s1, fixed] : [fixed, s1];
        link(a, b);
      }
    }
  }
  return graph;
}

function build(): string {
  let outline = '';
  let tint = '';

  for (const [x, y, s] of tiles()) {
    const cell = `M${x} ${y}h${s}v${s}h${-s}z`;
    outline += cell;
    if (dice(x, y, s) < 7) tint += cell;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<defs>',
    `<radialGradient id="f" gradientUnits="userSpaceOnUse" cx="0" cy="${H}" r="${FADE_REACH}">`,
    '<stop offset="0" stop-color="#fff"/>',
    '<stop offset="0.4" stop-color="#fff" stop-opacity="0.5"/>',
    '<stop offset="0.75" stop-color="#fff" stop-opacity="0.14"/>',
    '<stop offset="1" stop-color="#fff" stop-opacity="0"/>',
    '</radialGradient>',
    `<mask id="m"><rect width="${W}" height="${H}" fill="url(#f)"/></mask>`,
    '</defs>',
    '<g mask="url(#m)">',
    `<path d="${tint}" fill="${ACCENT}" fill-opacity="0.07"/>`,
    `<path d="${outline}" fill="none" stroke="${STROKE}" stroke-opacity="0.4" stroke-width="1"/>`,
    '</g>',
    '</svg>',
  ].join('');
}

/** CSS `url(...)` value of the backdrop. */
export const TILE_BACKDROP = `url("data:image/svg+xml,${encodeURIComponent(build())}")`;

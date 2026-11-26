import { useEffect, useMemo, useRef } from 'react';
import { BACKDROP_FADE_REACH, BACKDROP_H, BACKDROP_W, buildGridGraph, type Point } from './landing.backdrop';

/** Speed of the head in backdrop units per second. */
const SPEED = 360;
/** Length of the trail behind the head; it is drawn in slices that get fainter and thinner towards the tail. */
const TRAIL = 280;
const SLICES = 16;
const SLICE_LEN = TRAIL / SLICES;
const PINK = '#FF3D9A';
const PINK_LIGHT = '#FF9AD0';
/** The walk ends once it is this far from the corner. */
const WALK_REACH = BACKDROP_FADE_REACH * 0.85;
const MAX_STEPS = 160;
/** Pause between two runs, in ms. */
const PAUSE_MIN = 600;
const PAUSE_MAX = 1600;

const dist = (p: Point) => Math.hypot(p[0], p[1] - BACKDROP_H);

/**
 * Random walk over the tile lines, starting in the bottom-left corner. It never turns back on
 * itself right away and prefers steps that lead away from the corner, so the line travels
 * outward but wanders from run to run.
 */
function randomWalk(graph: Map<string, Point[]>): Point[] {
  const start: Point = [0, BACKDROP_H];
  const walk: Point[] = [start];
  let prev: Point | null = null;
  let cur = start;

  for (let i = 0; i < MAX_STEPS && dist(cur) < WALK_REACH; i++) {
    const options = (graph.get(`${cur[0]},${cur[1]}`) ?? []).filter(
      (n) => !prev || n[0] !== prev[0] || n[1] !== prev[1],
    );
    if (options.length === 0) break;
    const weights = options.map((n) => (dist(n) > dist(cur) ? 3 : 1));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let next = options[options.length - 1]!;
    for (let k = 0; k < options.length; k++) {
      roll -= weights[k]!;
      if (roll < 0) {
        next = options[k]!;
        break;
      }
    }
    walk.push(next);
    prev = cur;
    cur = next;
  }
  return walk;
}

/** SVG path of the walk with straight runs merged into single segments. */
function toPath(points: Point[]): string {
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1]!;
    const [x, y] = points[i]!;
    const next = points[i + 1];
    if (next && (next[0] - x) * (y - py) === (next[1] - y) * (x - px)) continue;
    d += `L${x} ${y}`;
  }
  return d;
}

/**
 * A line that grows out of the bottom-left corner, wanders along the tile outlines, fades out
 * and starts over on a new route. Sits exactly on top of the backdrop (same cover/bottom-left
 * geometry), so it follows the real lines.
 */
export function BackdropTrace() {
  const group = useRef<SVGGElement>(null);
  const graph = useMemo(buildGridGraph, []);

  useEffect(() => {
    const root = group.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glows = [...root.querySelectorAll<SVGPathElement>('[data-glow]')];
    const cores = [...root.querySelectorAll<SVGPathElement>('[data-core]')];
    const all = [...glows, ...cores];

    let raf = 0;
    let timer = 0;
    let length = 0;
    let startedAt = 0;

    const hide = () => all.forEach((p) => (p.style.opacity = '0'));

    const begin = () => {
      const d = toPath(randomWalk(graph));
      all.forEach((p) => p.setAttribute('d', d));
      length = cores[0]!.getTotalLength();
      startedAt = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const frame = (now: number) => {
      const head = ((now - startedAt) / 1000) * SPEED;
      const end = Math.min(head, length);
      // The whole trail dims while it runs out past the end of the route.
      const life = head <= length ? 1 : Math.max(0, 1 - (head - length) / TRAIL);

      for (let i = 0; i < SLICES; i++) {
        // Slice 0 is the tail end, the last slice sits at the head.
        const from = Math.max(0, head - TRAIL + i * SLICE_LEN);
        const to = Math.min(end, head - TRAIL + (i + 1) * SLICE_LEN);
        const visible = Math.max(0, to - from);
        const dash = `${visible} ${length + TRAIL}`;
        const level = ((i + 1) / SLICES) ** 1.6 * life;
        for (const [p, strength] of [
          [glows[i]!, 0.3],
          [cores[i]!, 1],
        ] as const) {
          p.style.strokeDasharray = dash;
          p.style.strokeDashoffset = String(-from);
          p.style.opacity = visible > 0 ? String(level * strength) : '0';
        }
      }

      if (head < length + TRAIL) {
        raf = requestAnimationFrame(frame);
      } else {
        hide();
        timer = window.setTimeout(begin, PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN));
      }
    };

    hide();
    timer = window.setTimeout(begin, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [graph]);

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${BACKDROP_W} ${BACKDROP_H}`}
      preserveAspectRatio="xMinYMax slice"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }}
    >
      <defs>
        <radialGradient
          id="trace-fade"
          gradientUnits="userSpaceOnUse"
          cx="0"
          cy={BACKDROP_H}
          r={BACKDROP_FADE_REACH}
        >
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="trace-mask">
          <rect width={BACKDROP_W} height={BACKDROP_H} fill="url(#trace-fade)" />
        </mask>
      </defs>
      <g ref={group} mask="url(#trace-mask)" fill="none" strokeLinejoin="round">
        {Array.from({ length: SLICES }, (_, i) => (
          <path key={`g${i}`} data-glow stroke={PINK} strokeWidth={3 + 3 * (i / SLICES)} />
        ))}
        {Array.from({ length: SLICES }, (_, i) => (
          <path key={`c${i}`} data-core stroke={PINK_LIGHT} strokeWidth={0.8 + 1.1 * (i / SLICES)} />
        ))}
      </g>
    </svg>
  );
}

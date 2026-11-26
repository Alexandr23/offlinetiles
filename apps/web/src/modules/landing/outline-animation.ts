export const GROW_MS = 5200;
export const HOLD_MS = 1600;
export const FADE_MS = 900;
export const GAP_MS = 500;
export const CYCLE_MS = GROW_MS + HOLD_MS + FADE_MS + GAP_MS;

/** Share of the growth phase spent on the main ring; islands and enclaves finish the cycle. */
const MAIN_SHARE = 0.86;

export interface OutlineFrame {
  /** Growth progress (0..1) of the main boundary ring. */
  main: number;
  /** Growth progress (0..1) of the remaining small rings. */
  rest: number;
  /** Overall opacity multiplier (fades out at the end of a cycle). */
  alpha: number;
  /** How much of the faint territory fill is shown (0..1). */
  fill: number;
  /** Brightness of the comet head (1) cooling to a uniformly lit outline (0). */
  heat: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Pure timeline: grow along the boundary, hold fully lit, fade out, repeat. */
export function outlineFrame(elapsedMs: number): OutlineFrame {
  const t = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;

  if (t < GROW_MS) {
    const p = easeInOutSine(t / GROW_MS);
    return { main: clamp01(p / MAIN_SHARE), rest: clamp01((p - MAIN_SHARE) / (1 - MAIN_SHARE)), alpha: 1, fill: 0, heat: 1 };
  }
  if (t < GROW_MS + HOLD_MS) {
    const fill = easeInOutSine(clamp01((t - GROW_MS) / (HOLD_MS * 0.6)));
    const heat = 1 - easeInOutSine(clamp01((t - GROW_MS) / (HOLD_MS * 0.5)));
    return { main: 1, rest: 1, alpha: 1, fill, heat };
  }
  if (t < GROW_MS + HOLD_MS + FADE_MS) {
    const k = clamp01((t - GROW_MS - HOLD_MS) / FADE_MS);
    return { main: 1, rest: 1, alpha: 1 - k, fill: 1 - k, heat: 0 };
  }
  return { main: 0, rest: 0, alpha: 0, fill: 0, heat: 1 };
}

/** Frame used for reduced-motion users: the finished outline, no animation. */
export const STATIC_OUTLINE_FRAME: OutlineFrame = { main: 1, rest: 1, alpha: 1, fill: 1, heat: 0 };

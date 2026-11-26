import { describe, expect, it } from 'vitest';
import { CYCLE_MS, FADE_MS, GAP_MS, GROW_MS, HOLD_MS, outlineFrame } from './outline-animation';

describe('outlineFrame', () => {
  it('starts empty', () => {
    expect(outlineFrame(0)).toMatchObject({ main: 0, rest: 0, alpha: 1 });
  });

  it('grows the main ring first, then the small rings', () => {
    const mid = outlineFrame(GROW_MS * 0.5);
    expect(mid.main).toBeGreaterThan(0);
    expect(mid.main).toBeLessThan(1);
    expect(mid.rest).toBe(0);

    const late = outlineFrame(GROW_MS * 0.97);
    expect(late.main).toBe(1);
    expect(late.rest).toBeGreaterThan(0);
  });

  it('holds fully covered, then fades and restarts', () => {
    expect(outlineFrame(GROW_MS + HOLD_MS * 0.9)).toMatchObject({ main: 1, rest: 1, alpha: 1, fill: 1 });
    const fading = outlineFrame(GROW_MS + HOLD_MS + FADE_MS / 2);
    expect(fading.alpha).toBeCloseTo(0.5);
    expect(outlineFrame(CYCLE_MS - GAP_MS / 2)).toMatchObject({ main: 0, alpha: 0 });
    expect(outlineFrame(CYCLE_MS + 10)).toEqual(outlineFrame(10));
  });

  it('never leaves the 0..1 range', () => {
    for (let t = 0; t < CYCLE_MS * 2; t += 37) {
      const f = outlineFrame(t);
      for (const v of [f.main, f.rest, f.alpha, f.fill, f.heat]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

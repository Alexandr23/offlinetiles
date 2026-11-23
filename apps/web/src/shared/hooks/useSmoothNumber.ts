import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates a number towards `target` over `durationMs` using requestAnimationFrame,
 * so values coming from throttled SSE updates glide instead of jumping.
 */
export function useSmoothNumber(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const start = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const current = useRef(target);

  useEffect(() => {
    if (durationMs <= 0 || prefersReducedMotion() || !Number.isFinite(target)) {
      current.current = target;
      setValue(target);
      return;
    }
    from.current = current.current;
    start.current = null;
    const delta = target - from.current;
    if (Math.abs(delta) < 1e-9) return;

    const tick = (now: number) => {
      if (start.current === null) start.current = now;
      const t = Math.min(1, (now - start.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from.current + delta * eased;
      current.current = next;
      setValue(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}

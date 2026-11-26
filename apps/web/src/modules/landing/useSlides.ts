import { useEffect, useState, type RefObject } from 'react';

/** Put this attribute on each full-screen section, in document order. */
export const SLIDE_ATTR = 'data-slide';

/** Ignore wheel input for this long after a page turn, while the scroll animation runs. */
const LOCK_MS = 700;
/** A pause this long between wheel events means a new gesture rather than trackpad inertia. */
const QUIET_MS = 150;
/** Inertia only decays; a jump of more than this between events is the user pushing again. */
const JITTER_PX = 6;
/** Keys that turn a slide. Shift+Space goes back; Home and End are left to the browser. */
const KEY_STEPS: Record<string, number | undefined> = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };

export interface SlidesState {
  /** Index of the slide under the middle of the viewport. */
  active: number;
  /** Slides that have entered the viewport at least once (drives the reveal animation). */
  seen: ReadonlySet<number>;
}

/**
 * Slide-show behaviour for a page of full-screen sections.
 *
 * Snapping itself is CSS (`scroll-snap-type` on the root), so touch, keyboard and no-JS all work.
 * This adds what CSS cannot: one wheel gesture, trackpad swipe or arrow key turns exactly one slide,
 * and the page knows which slide is showing. Paging steps aside whenever a slide is taller than the viewport
 * (small screens), because its content then has to be scrolled through normally.
 */
export function useSlides(root: RefObject<HTMLElement | null>): SlidesState {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));

  useEffect(() => {
    const slides = Array.from(root.current?.querySelectorAll<HTMLElement>(`[${SLIDE_ATTR}]`) ?? []);
    if (slides.length === 0) return;

    const watch = (rootMargin: string, onEnter: (index: number) => void) => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) onEnter(slides.indexOf(entry.target as HTMLElement));
          }
        },
        { rootMargin },
      );
      for (const slide of slides) observer.observe(slide);
      return observer;
    };
    // A zero-height line across the middle of the viewport: exactly one slide crosses it.
    const activeObserver = watch('-50% 0px -50% 0px', setActive);
    const seenObserver = watch('0px 0px -20% 0px', (index) =>
      setSeen((prev) => (prev.has(index) ? prev : new Set(prev).add(index))),
    );

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const top = (slide: HTMLElement) => slide.getBoundingClientRect().top;
    const everySlideFits = () => slides.every((slide) => slide.offsetHeight <= window.innerHeight + 1);
    const nearest = () =>
      slides.reduce((best, slide, i) => (Math.abs(top(slide)) < Math.abs(top(slides[best]!)) ? i : best), 0);

    let lockedUntil = 0;
    let lastAt = 0;
    let lastSize = 0;

    /** Scroll one slide forward (1) or back (-1), unless a turn is already under way. */
    const turn = (direction: number, now: number) => {
      const target = slides[nearest() + direction];
      if (!target || now < lockedUntil) return;
      lockedUntil = now + LOCK_MS;
      window.scrollTo({ top: window.scrollY + top(target), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    };

    const onWheel = (event: WheelEvent) => {
      // Leave pinch-zoom, horizontal swipes and pages that need normal scrolling alone.
      if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !everySlideFits())
        return;
      event.preventDefault();

      const size = Math.abs(event.deltaY);
      const newGesture = event.timeStamp - lastAt > QUIET_MS || size > lastSize + JITTER_PX;
      lastAt = event.timeStamp;
      lastSize = size;
      if (newGesture) turn(Math.sign(event.deltaY), event.timeStamp);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.key === ' ' && event.shiftKey ? -1 : KEY_STEPS[event.key];
      if (!step || event.altKey || event.ctrlKey || event.metaKey || !everySlideFits()) return;
      // Keys that mean something to the focused control stay with it.
      if ((event.target as Element).closest('input, textarea, select, button, [contenteditable]')) return;
      event.preventDefault();
      turn(step, event.timeStamp);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      activeObserver.disconnect();
      seenObserver.disconnect();
    };
  }, [root]);

  return { active, seen };
}

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import styled, { css } from 'styled-components';

type SliderSize = 'md' | 'lg';

const BOXED_PAD = 2;
const BOXED_THUMB = 28;

const Track = styled.div<{ $size: SliderSize; $boxed: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  ${({ $boxed, $size }) =>
    $boxed
      ? css`
          height: 30px;
          background: var(--color-surface-1);
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
        `
      : css`
          height: ${$size === 'lg' ? 32 : 20}px;
          &::before {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            height: ${$size === 'lg' ? 4 : 2}px;
            background: var(--color-surface-active);
            border-radius: 2px;
          }
        `}
`;

const Fill = styled.div<{ $size: SliderSize }>`
  position: absolute;
  height: ${({ $size }) => ($size === 'lg' ? 4 : 2)}px;
  background: var(--color-accent);
  border-radius: 2px;
  pointer-events: none;
`;

const Thumb = styled.div<{ $size: SliderSize; $boxed: boolean }>`
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  transition:
    box-shadow var(--duration-fast) var(--easing-standard),
    background var(--duration-fast) var(--easing-standard);
  ${({ $boxed, $size }) =>
    $boxed
      ? css`
          top: ${BOXED_PAD}px;
          bottom: ${BOXED_PAD}px;
          width: ${BOXED_THUMB}px;
          border-radius: var(--radius-sm);
          background: var(--color-accent);
          border: 1px solid transparent;
          color: var(--color-text-inverse);
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: var(--font-weight-semibold);
          font-variant-numeric: tabular-nums;
          &:hover,
          &:focus-visible {
            background: var(--color-accent-strong);
            box-shadow: var(--shadow-glow);
          }
        `
      : css`
          border-radius: 50%;
          background: var(--color-text-primary);
          border: 2px solid var(--color-accent);
          ${$size === 'lg'
            ? css`
                width: 18px;
                height: 18px;
                margin-left: -9px;
              `
            : css`
                width: 10px;
                height: 10px;
                margin-left: -5px;
              `}
          ${Track}:hover &,
          &:focus-visible {
            box-shadow: 0 0 0 4px var(--color-accent-muted);
            transform: scale(1.1);
          }
        `}
`;

const BoxedTicks = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
`;

const BoxedTick = styled.span<{ $active: boolean }>`
  position: absolute;
  top: 50%;
  width: 1px;
  height: 6px;
  margin-top: -3px;
  border-radius: 1px;
  background: ${({ $active }) => ($active ? 'var(--color-accent)' : 'rgba(148, 176, 204, 0.28)')};
  transition: background var(--duration-fast) var(--easing-standard);
`;

const Ticks = styled.div<{ $size: SliderSize }>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${({ $size }) => ($size === 'lg' ? 22 : 14)}px;
  height: 6px;
  pointer-events: none;
`;

const Tick = styled.span`
  position: absolute;
  width: 1px;
  height: 4px;
  background: var(--color-border-strong);
  transform: translateX(-0.5px);
`;

interface BaseProps {
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  ticks?: boolean;
  size?: SliderSize;
  /** Show the current value inside each thumb (range slider). */
  showValues?: boolean;
  'aria-label'?: string;
}

export interface SliderProps extends BaseProps {
  value: number;
  onChange: (value: number) => void;
}

function useTrackValue(min: number, max: number, step: number, inset = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const toValue = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return min;
      const r = el.getBoundingClientRect();
      const usable = Math.max(1, r.width - inset * 2);
      const ratio = Math.min(1, Math.max(0, (clientX - r.left - inset) / usable));
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
    },
    [min, max, step, inset],
  );
  return { ref, toValue };
}

/** Left edge of a boxed thumb for a 0–1 ratio, kept inside the track. */
function boxedThumbLeft(ratio: number, thumbWidth: number): string {
  return `calc(${BOXED_PAD}px + ${ratio} * (100% - ${BOXED_PAD * 2}px - ${thumbWidth}px))`;
}

/** Center line of a boxed thumb — same axis ticks use so marks line up with handles. */
function boxedThumbCenter(ratio: number, thumbWidth: number): string {
  return `calc(${BOXED_PAD + thumbWidth / 2}px + ${ratio} * (100% - ${BOXED_PAD * 2}px - ${thumbWidth}px))`;
}

export function Slider({ value, min, max, step = 1, onChange, disabled, ticks, size = 'md', ...rest }: SliderProps) {
  const { ref, toValue } = useTrackValue(min, max, step);
  const pct = ((value - min) / (max - min)) * 100;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onChange(toValue(e.clientX));
    const move = (ev: PointerEvent) => onChange(toValue(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next = value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else return;
    e.preventDefault();
    onChange(Math.min(max, Math.max(min, Number(next.toFixed(6)))));
  };

  return (
    <Track ref={ref} $size={size} $boxed={false} onPointerDown={onPointerDown} style={{ opacity: disabled ? 0.5 : 1 }}>
      <Fill $size={size} style={{ left: 0, width: `${pct}%` }} />
      <Thumb
        $size={size}
        $boxed={false}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={rest['aria-label']}
        onKeyDown={onKeyDown}
        style={{ left: `${pct}%` }}
      />
      {ticks && <OuterTickMarks min={min} max={max} step={step} size={size} />}
    </Track>
  );
}

export interface RangeSliderProps extends BaseProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  ticks,
  size = 'md',
  showValues = false,
  ...rest
}: RangeSliderProps) {
  const boxed = size === 'lg';
  const thumbW = BOXED_THUMB;
  const inset = boxed ? BOXED_PAD + thumbW / 2 : 0;
  const { ref, toValue } = useTrackValue(min, max, step, inset);
  const [lo, hi] = value;
  const loRatio = (lo - min) / (max - min || 1);
  const hiRatio = (hi - min) / (max - min || 1);
  const loPct = loRatio * 100;
  const hiPct = hiRatio * 100;

  const update = (which: 0 | 1, v: number) => {
    if (which === 0) onChange([Math.min(v, hi), hi]);
    else onChange([lo, Math.max(v, lo)]);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const v = toValue(e.clientX);
    const which: 0 | 1 = Math.abs(v - lo) <= Math.abs(v - hi) ? 0 : 1;
    update(which, v);
    const move = (ev: PointerEvent) => update(which, toValue(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const keyHandler = (which: 0 | 1) => (e: React.KeyboardEvent) => {
    const cur = which === 0 ? lo : hi;
    let next = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else return;
    e.preventDefault();
    update(which, Math.min(max, Math.max(min, next)));
  };

  return (
    <Track ref={ref} $size={size} $boxed={boxed} onPointerDown={onPointerDown} style={{ opacity: disabled ? 0.5 : 1 }}>
      {boxed ? (
        <BoxedTickMarks min={min} max={max} step={step} lo={lo} hi={hi} thumbWidth={thumbW} />
      ) : (
        <Fill $size={size} style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }} />
      )}
      <Thumb
        $size={size}
        $boxed={boxed}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={hi}
        aria-valuenow={lo}
        aria-label={rest['aria-label'] ? `${rest['aria-label']} minimum` : 'minimum'}
        onKeyDown={keyHandler(0)}
        style={boxed ? { left: boxedThumbLeft(loRatio, thumbW) } : { left: `${loPct}%` }}
      >
        {showValues ? lo : null}
      </Thumb>
      <Thumb
        $size={size}
        $boxed={boxed}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={lo}
        aria-valuemax={max}
        aria-valuenow={hi}
        aria-label={rest['aria-label'] ? `${rest['aria-label']} maximum` : 'maximum'}
        onKeyDown={keyHandler(1)}
        style={boxed ? { left: boxedThumbLeft(hiRatio, thumbW) } : { left: `${hiPct}%` }}
      >
        {showValues ? hi : null}
      </Thumb>
      {ticks && !boxed && <OuterTickMarks min={min} max={max} step={step} size={size} />}
    </Track>
  );
}

function BoxedTickMarks({
  min,
  max,
  step,
  lo,
  hi,
  thumbWidth,
}: {
  min: number;
  max: number;
  step: number;
  lo: number;
  hi: number;
  thumbWidth: number;
}) {
  const count = Math.round((max - min) / step);
  if (count <= 0 || count > 48) return null;
  return (
    <BoxedTicks aria-hidden>
      {Array.from({ length: count + 1 }, (_, i) => {
        const v = min + i * step;
        const ratio = i / count;
        const active = v >= lo && v <= hi;
        return (
          <BoxedTick
            key={i}
            $active={active}
            style={{ left: boxedThumbCenter(ratio, thumbWidth), transform: 'translateX(-50%)' }}
          />
        );
      })}
    </BoxedTicks>
  );
}

function OuterTickMarks({ min, max, step, size }: { min: number; max: number; step: number; size: SliderSize }) {
  const count = Math.round((max - min) / step);
  if (count > 40) return null;
  return (
    <Ticks $size={size} aria-hidden>
      {Array.from({ length: count + 1 }, (_, i) => (
        <Tick key={i} style={{ left: `${(i / count) * 100}%` }} />
      ))}
    </Ticks>
  );
}

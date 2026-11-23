import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  'aria-label'?: string;
}

const Root = styled.div<{ $block: boolean; $size: 'sm' | 'md' }>`
  position: relative;
  display: ${({ $block }) => ($block ? 'grid' : 'inline-grid')};
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  height: ${({ $size }) => ($size === 'sm' ? 24 : 30)}px;
  padding: 2px;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  isolation: isolate;
`;

const Indicator = styled.div`
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: var(--color-accent);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    transform var(--duration-base) var(--easing-emphasized),
    width var(--duration-base) var(--easing-emphasized);
  z-index: 0;
`;

const Segment = styled.button<{ $active: boolean; $size: 'sm' | 'md' }>`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 ${({ $size }) => ($size === 'sm' ? 8 : 12)}px;
  border-radius: var(--radius-sm);
  font-size: ${({ $size }) => ($size === 'sm' ? 'var(--font-size-sm)' : 'var(--font-size-md)')};
  font-weight: ${({ $active }) => ($active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)')};
  color: ${({ $active }) => ($active ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)')};
  transition: color var(--duration-fast) var(--easing-standard);
  white-space: nowrap;
  &:hover:not(:disabled) {
    color: ${({ $active }) => ($active ? 'var(--color-text-inverse)' : 'var(--color-text-primary)')};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  svg {
    width: 14px;
    height: 14px;
  }
`;

export function SegmentedControl<T extends string>({ value, options, onChange, size = 'md', block = false, ...rest }: SegmentedControlProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (!el || !root.current) return;
    const r = el.getBoundingClientRect();
    const pr = root.current.getBoundingClientRect();
    setIndicator({ x: r.left - pr.left - 2, w: r.width });
  }, [value, options.length]);

  return (
    <Root ref={root} role="radiogroup" aria-label={rest['aria-label']} $block={block} $size={size}>
      {indicator && <Indicator style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w, left: 2 }} />}
      {options.map((o) => (
        <Segment
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-value={o.value}
          disabled={o.disabled}
          $active={o.value === value}
          $size={size}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </Segment>
      ))}
    </Root>
  );
}

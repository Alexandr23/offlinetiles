import { cloneElement, useCallback, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement<Record<string, unknown>>;
  delay?: number;
}

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

/** Positioning shell — keep transform here so enter animation never fights placement. */
const Anchor = styled.div<{ $side: NonNullable<TooltipProps['side']> }>`
  position: fixed;
  z-index: var(--z-tooltip);
  pointer-events: none;
  transform: ${({ $side }) =>
    $side === 'top'
      ? 'translate(-50%, -100%)'
      : $side === 'left'
        ? 'translate(-100%, -50%)'
        : $side === 'right'
          ? 'translateY(-50%)'
          : 'translateX(-50%)'};
`;

const Bubble = styled.div`
  padding: 5px 8px;
  background: #0a0e14;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #f3f6fa;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  animation: ${fadeIn} 120ms ease-out;
`;

const GAP = 8;

export function Tooltip({ content, side = 'bottom', children, delay = 280 }: TooltipProps) {
  const id = useId();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const anchor = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      switch (side) {
        case 'top':
          setPos({ x: r.left + r.width / 2, y: r.top - GAP });
          break;
        case 'left':
          setPos({ x: r.left - GAP, y: r.top + r.height / 2 });
          break;
        case 'right':
          setPos({ x: r.right + GAP, y: r.top + r.height / 2 });
          break;
        default:
          setPos({ x: r.left + r.width / 2, y: r.bottom + GAP });
      }
    }, delay);
  }, [delay, side]);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  }, []);

  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      anchor.current = node;
      const childRef = (children as { ref?: unknown }).ref;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object') (childRef as { current: unknown }).current = node;
    },
    onMouseEnter: (e: unknown) => {
      show();
      (children.props.onMouseEnter as ((e: unknown) => void) | undefined)?.(e);
    },
    onMouseLeave: (e: unknown) => {
      hide();
      (children.props.onMouseLeave as ((e: unknown) => void) | undefined)?.(e);
    },
    onFocus: (e: unknown) => {
      show();
      (children.props.onFocus as ((e: unknown) => void) | undefined)?.(e);
    },
    onBlur: (e: unknown) => {
      hide();
      (children.props.onBlur as ((e: unknown) => void) | undefined)?.(e);
    },
    'aria-describedby': pos ? id : undefined,
  });

  return (
    <>
      {child}
      {pos &&
        content &&
        createPortal(
          <Anchor $side={side} style={{ left: pos.x, top: pos.y }}>
            <Bubble id={id} role="tooltip">
              {content}
            </Bubble>
          </Anchor>,
          document.body,
        )}
    </>
  );
}

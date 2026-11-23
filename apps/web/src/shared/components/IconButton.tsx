import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'accent' | 'danger';
  children: ReactNode;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

const sizes = { sm: 24, md: 28, lg: 34 };

const Root = styled.button<{ $active: boolean; $size: number; $tone: 'default' | 'accent' | 'danger' }>`
  display: inline-grid;
  place-items: center;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  color: var(--color-text-secondary);
  background: transparent;
  transition:
    background var(--duration-fast) var(--easing-standard),
    color var(--duration-fast) var(--easing-standard),
    border-color var(--duration-fast) var(--easing-standard),
    box-shadow var(--duration-base) var(--easing-standard);

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  &:active:not(:disabled) {
    background: var(--color-surface-active);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  ${({ $tone }) =>
    $tone === 'danger' &&
    css`
      &:hover:not(:disabled) {
        color: var(--color-danger);
        background: var(--color-danger-muted);
      }
    `}

  ${({ $active }) =>
    $active &&
    css`
      background: var(--color-accent-muted);
      color: var(--color-accent);
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent-muted);
      &:hover:not(:disabled) {
        background: var(--color-accent-muted);
        color: var(--color-accent-strong);
      }
    `}

  svg {
    width: ${({ $size }) => Math.round($size * 0.58)}px;
    height: ${({ $size }) => Math.round($size * 0.58)}px;
  }
`;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active = false, size = 'md', tone = 'default', children, tooltipSide = 'bottom', ...rest },
  ref,
) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <Root ref={ref} aria-label={label} aria-pressed={active || undefined} $active={active} $size={sizes[size]} $tone={tone} type="button" {...rest}>
        {children}
      </Root>
    </Tooltip>
  );
});

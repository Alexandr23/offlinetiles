import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const sizeStyles = {
  sm: css`
    height: 24px;
    padding: 0 8px;
    font-size: var(--font-size-sm);
    gap: 5px;
  `,
  md: css`
    height: 30px;
    padding: 0 12px;
    font-size: var(--font-size-md);
    gap: 7px;
  `,
  lg: css`
    height: 38px;
    padding: 0 16px;
    font-size: var(--font-size-lg);
    gap: 8px;
  `,
};

const variantStyles = {
  primary: css`
    background: var(--color-accent);
    color: var(--color-text-inverse);
    border-color: transparent;
    font-weight: var(--font-weight-semibold);
    &:hover:not(:disabled) {
      background: var(--color-accent-strong);
      box-shadow: var(--shadow-glow);
    }
    &:active:not(:disabled) {
      transform: translateY(1px);
    }
  `,
  secondary: css`
    background: var(--color-surface-3);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
    &:hover:not(:disabled) {
      background: var(--color-surface-hover);
      border-color: var(--color-text-muted);
    }
    &:active:not(:disabled) {
      background: var(--color-surface-active);
    }
  `,
  ghost: css`
    background: transparent;
    color: var(--color-text-secondary);
    border-color: transparent;
    &:hover:not(:disabled) {
      background: var(--color-surface-hover);
      color: var(--color-text-primary);
    }
    &:active:not(:disabled) {
      background: var(--color-surface-active);
    }
  `,
  danger: css`
    background: var(--color-danger-muted);
    color: var(--color-danger);
    border-color: transparent;
    &:hover:not(:disabled) {
      background: var(--color-danger);
      color: var(--color-text-inverse);
    }
  `,
};

const Root = styled.button<{ $variant: ButtonVariant; $size: ButtonSize; $block: boolean; $loading: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid;
  border-radius: var(--radius-md);
  letter-spacing: 0.01em;
  white-space: nowrap;
  user-select: none;
  transition:
    background var(--duration-fast) var(--easing-standard),
    color var(--duration-fast) var(--easing-standard),
    border-color var(--duration-fast) var(--easing-standard),
    box-shadow var(--duration-base) var(--easing-standard),
    transform var(--duration-fast) var(--easing-standard);
  ${({ $size }) => sizeStyles[$size]}
  ${({ $variant }) => variantStyles[$variant]}
  ${({ $block }) =>
    $block &&
    css`
      width: 100%;
    `}
  ${({ $loading }) =>
    $loading &&
    css`
      color: transparent !important;
      pointer-events: none;
    `}

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  svg {
    width: 1.1em;
    height: 1.1em;
    flex-shrink: 0;
  }
`;

const LoadingLayer = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--color-text-primary);
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, block = false, icon, iconRight, children, disabled, ...rest },
  ref,
) {
  return (
    <Root
      ref={ref}
      $variant={variant}
      $size={size}
      $block={block}
      $loading={loading}
      disabled={disabled || loading}
      type={rest.type ?? 'button'}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
      {loading && (
        <LoadingLayer aria-hidden>
          <Spinner size={14} />
        </LoadingLayer>
      )}
    </Root>
  );
});

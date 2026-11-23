import { forwardRef, type InputHTMLAttributes } from 'react';
import styled, { css } from 'styled-components';

export const inputBase = css`
  height: 28px;
  padding: 0 8px;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  outline: none;
  transition:
    border-color var(--duration-fast) var(--easing-standard),
    background var(--duration-fast) var(--easing-standard),
    box-shadow var(--duration-fast) var(--easing-standard);

  &::placeholder {
    color: var(--color-text-muted);
  }
  &:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }
  &:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-muted);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StyledInput = styled.input<{ $mono?: boolean; $invalid?: boolean }>`
  ${inputBase}
  width: 100%;
  ${({ $mono }) =>
    $mono &&
    css`
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
    `}
  ${({ $invalid }) =>
    $invalid &&
    css`
      border-color: var(--color-danger) !important;
    `}
`;

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ mono, invalid, ...rest }, ref) {
  return <StyledInput ref={ref} $mono={mono} $invalid={invalid} aria-invalid={invalid || undefined} {...rest} />;
});

const NumberRoot = styled.div`
  display: inline-flex;
  align-items: stretch;
  height: 28px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--easing-standard);
  &:hover {
    border-color: var(--color-border-strong);
  }
  &:focus-within {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-muted);
  }
`;

const NumberField = styled.input`
  width: 48px;
  border: 0;
  background: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: var(--font-size-md);
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

const Step = styled.button`
  width: 22px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1;
  border-left: 1px solid var(--color-border-subtle);
  &:first-child {
    border-left: 0;
    border-right: 1px solid var(--color-border-subtle);
  }
  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

export interface NumberInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function NumberInput({ value, min, max, step = 1, onChange, disabled, ...rest }: NumberInputProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <NumberRoot>
      <Step type="button" onClick={() => onChange(clamp(value - step))} disabled={disabled || value <= min} aria-label="decrease">
        −
      </Step>
      <NumberField
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        aria-label={rest['aria-label']}
      />
      <Step type="button" onClick={() => onChange(clamp(value + step))} disabled={disabled || value >= max} aria-label="increase">
        +
      </Step>
    </NumberRoot>
  );
}

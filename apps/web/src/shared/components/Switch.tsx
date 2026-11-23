import styled from 'styled-components';

const Root = styled.button<{ $on: boolean; $size: 'sm' | 'md' }>`
  position: relative;
  width: ${({ $size }) => ($size === 'sm' ? 26 : 32)}px;
  height: ${({ $size }) => ($size === 'sm' ? 14 : 18)}px;
  border-radius: var(--radius-round);
  background: ${({ $on }) => ($on ? 'var(--color-accent)' : 'var(--color-surface-active)')};
  border: 1px solid ${({ $on }) => ($on ? 'var(--color-accent)' : 'var(--color-border-strong)')};
  transition:
    background var(--duration-base) var(--easing-standard),
    border-color var(--duration-base) var(--easing-standard);
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 1px;
    left: 1px;
    width: ${({ $size }) => ($size === 'sm' ? 10 : 14)}px;
    height: ${({ $size }) => ($size === 'sm' ? 10 : 14)}px;
    border-radius: 50%;
    background: ${({ $on }) => ($on ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)')};
    transform: translateX(${({ $on, $size }) => ($on ? ($size === 'sm' ? 12 : 14) : 0)}px);
    transition:
      transform var(--duration-base) var(--easing-spring),
      background var(--duration-base) var(--easing-standard);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export function Switch({ checked, onChange, disabled, size = 'md', ...rest }: SwitchProps) {
  return (
    <Root
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      $on={checked}
      $size={size}
      onClick={() => onChange(!checked)}
    />
  );
}

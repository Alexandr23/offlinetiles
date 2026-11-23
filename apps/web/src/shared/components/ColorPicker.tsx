import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { normalizeHexColor } from '../utils/color';

const Root = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px 0 3px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  transition: border-color var(--duration-fast) var(--easing-standard);
  &:hover {
    border-color: var(--color-border-strong);
  }
  &:focus-within {
    border-color: var(--color-accent);
  }
`;

const Swatch = styled.label`
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
  input {
    position: absolute;
    inset: -8px;
    width: 32px;
    height: 32px;
    opacity: 0;
    cursor: pointer;
  }
`;

const Hex = styled.input`
  width: 62px;
  border: 0;
  background: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  outline: none;
  &::placeholder {
    color: var(--color-text-muted);
  }
`;

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function ColorPicker({ value, onChange, disabled, ...rest }: ColorPickerProps) {
  const hex = normalizeHexColor(value) ?? '#000000';
  const [draft, setDraft] = useState(hex);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(hex);
  }, [hex]);

  const commit = () => {
    const n = normalizeHexColor(draft);
    if (n) onChange(n);
    else setDraft(hex);
  };

  return (
    <Root>
      <Swatch style={{ background: hex }}>
        <input type="color" value={hex} disabled={disabled} aria-label={rest['aria-label']} onChange={(e) => onChange(e.target.value)} />
      </Swatch>
      <Hex
        value={draft}
        disabled={disabled}
        spellCheck={false}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={rest['aria-label'] ? `${rest['aria-label']} hex` : 'hex'}
      />
    </Root>
  );
}

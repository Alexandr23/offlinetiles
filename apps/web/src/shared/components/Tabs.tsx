import type { ReactNode } from 'react';
import styled from 'styled-components';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

const Root = styled.div`
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 36px;
  padding: 0 8px;
  border-bottom: 1px solid rgba(148, 176, 204, 0.1);
  flex-shrink: 0;
  background: transparent;
`;

const Tab = styled.button<{ $active: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $active }) => ($active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)')};
  transition: color var(--duration-fast) var(--easing-standard);
  &:hover {
    color: var(--color-text-primary);
  }
  &::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: -1px;
    height: 2px;
    background: var(--color-accent);
    transform: scaleX(${({ $active }) => ($active ? 1 : 0)});
    transform-origin: left;
    transition: transform var(--duration-base) var(--easing-emphasized);
  }
`;

const Count = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  padding: 0 5px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-3);
  color: var(--color-text-secondary);
  text-align: center;
  letter-spacing: 0;
`;

export function Tabs<T extends string>({ value, items, onChange }: { value: T; items: TabItem<T>[]; onChange: (v: T) => void }) {
  return (
    <Root role="tablist">
      {items.map((t) => (
        <Tab key={t.value} role="tab" aria-selected={t.value === value} $active={t.value === value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <Count>{t.count}</Count>}
        </Tab>
      ))}
    </Root>
  );
}

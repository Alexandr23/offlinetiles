import type { HTMLAttributes, ReactNode } from 'react';
import styled from 'styled-components';

export const Panel = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--color-surface-1);
  border-color: var(--color-border-subtle);
`;

const HeaderRoot = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(148, 176, 204, 0.1);
  flex-shrink: 0;
  background: transparent;
`;

const HeaderTitle = styled.h2`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  svg {
    width: 14px;
    height: 14px;
    color: var(--color-text-muted);
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

export function PanelHeader({ title, icon, actions, ...rest }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <HeaderRoot {...rest}>
      <HeaderTitle>
        {icon}
        {title}
      </HeaderTitle>
      {actions && <HeaderActions>{actions}</HeaderActions>}
    </HeaderRoot>
  );
}

export const PanelBody = styled.div<{ $padded?: boolean }>`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${({ $padded = true }) => ($padded ? '12px' : 0)};
`;

export const PanelFooter = styled.footer`
  padding: 12px;
  border-top: 1px solid rgba(148, 176, 204, 0.1);
  flex-shrink: 0;
  background: transparent;
`;

export const Divider = styled.hr<{ $spacing?: number }>`
  border: 0;
  border-top: 1px solid var(--color-border-subtle);
  margin: ${({ $spacing = 12 }) => `${$spacing}px 0`};
`;

export const SectionLabel = styled.div`
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
`;

export const Mono = styled.span<{ $muted?: boolean; $size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }>`
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: ${({ $size = 'md' }) => `var(--font-size-${$size})`};
  color: ${({ $muted }) => ($muted ? 'var(--color-text-muted)' : 'inherit')};
`;

export const Hint = styled.p`
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
`;

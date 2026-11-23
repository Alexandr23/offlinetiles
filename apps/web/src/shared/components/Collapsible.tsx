import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { IconChevronRight } from './Icons';

const Root = styled.div`
  border-bottom: 1px solid var(--color-border-subtle);
  &:last-child {
    border-bottom: 0;
  }
`;

const Header = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 34px;
  padding: 0 4px 0 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: left;
  transition: color var(--duration-fast) var(--easing-standard);
  &:hover {
    color: var(--color-accent);
  }
  svg {
    width: 14px;
    height: 14px;
    color: var(--color-text-muted);
    transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg);
    transition: transform var(--duration-base) var(--easing-emphasized);
  }
`;

const Left = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const Meta = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  letter-spacing: 0;
  text-transform: none;
  font-weight: var(--font-weight-regular);
`;

const Body = styled.div<{ $open: boolean }>`
  display: grid;
  grid-template-rows: ${({ $open }) => ($open ? '1fr' : '0fr')};
  transition: grid-template-rows var(--duration-slow) var(--easing-emphasized);
  > div {
    overflow: hidden;
    min-height: 0;
  }
`;

const Inner = styled.div`
  padding: 2px 0 12px;
`;

export function Collapsible({
  title,
  meta,
  defaultOpen = false,
  children,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Root>
      <Header type="button" $open={open} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Left>
          <IconChevronRight />
          {title}
          {meta && <Meta>{meta}</Meta>}
        </Left>
        {actions}
      </Header>
      <Body $open={open}>
        <div>
          <Inner>{children}</Inner>
        </div>
      </Body>
    </Root>
  );
}

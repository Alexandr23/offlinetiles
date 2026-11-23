import type { ReactNode } from 'react';
import styled from 'styled-components';

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 30px;
  padding: 2px 0;
`;

const Label = styled.span`
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Control = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
`;

const Value = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const SliderWrap = styled.div`
  width: 110px;
`;

export function PropertyRow({ label, children, value }: { label: ReactNode; children: ReactNode; value?: ReactNode }) {
  return (
    <Row>
      <Label>{label}</Label>
      <Control>
        {children}
        {value !== undefined && <Value>{value}</Value>}
      </Control>
    </Row>
  );
}

export function SliderPropertyRow({ label, children, value }: { label: ReactNode; children: ReactNode; value: ReactNode }) {
  return (
    <Row>
      <Label>{label}</Label>
      <Control>
        <SliderWrap>{children}</SliderWrap>
        <Value>{value}</Value>
      </Control>
    </Row>
  );
}

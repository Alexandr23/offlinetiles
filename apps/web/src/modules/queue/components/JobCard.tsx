import type { Generation } from '@map-exporter/contracts';
import type { ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { Mono } from '@/shared/components/Panel';
import { GenerationStatusBadge } from '@/shared/components/StatusIndicator';
import { formatZoomRange } from '@/shared/utils/format';

const Root = styled.article<{ $highlight: boolean; $leaving: boolean }>`
  position: relative;
  padding: 10px 12px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  animation: me-slide-up var(--duration-slow) var(--easing-emphasized);
  transition:
    border-color var(--duration-base) var(--easing-standard),
    transform var(--duration-slow) var(--easing-emphasized),
    opacity var(--duration-slow) var(--easing-standard);
  ${({ $highlight }) =>
    $highlight &&
    css`
      border-color: var(--color-accent);
      box-shadow: var(--shadow-glow);
    `}
  ${({ $leaving }) =>
    $leaving &&
    css`
      border-color: var(--color-success);
      box-shadow: 0 0 0 1px var(--color-success-muted), 0 0 18px var(--color-success-muted);
    `}
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const Name = styled.h3`
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const Position = styled.span`
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 18px;
  padding: 0 5px;
  margin-right: 8px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-active);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
`;

const Actions = styled.div`
  display: flex;
  gap: 2px;
  flex-shrink: 0;
`;

export function JobCard({
  job,
  position,
  highlight = false,
  leaving = false,
  actions,
  children,
}: {
  job: Generation;
  position?: number | null;
  highlight?: boolean;
  leaving?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Root $highlight={highlight} $leaving={leaving} aria-label={job.name}>
      <Head>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
          {position !== undefined && position !== null && <Position>#{position}</Position>}
          <Name title={job.name}>{job.name}</Name>
        </div>
        <Actions>{actions}</Actions>
      </Head>
      <Meta>
        <GenerationStatusBadge status={job.status} size="sm" />
        <span>{job.content}</span>
        <span>{job.container}</span>
        <span>{formatZoomRange(job.minZoom, job.maxZoom)}</span>
        {job.styleName && <span title="style">{job.styleName}</span>}
      </Meta>
      {children}
    </Root>
  );
}

export { Mono };

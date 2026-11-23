import { useMemo } from 'react';
import styled, { css } from 'styled-components';
import { selectionAreaKm2, useDrawingStore } from '@/modules/drawing/drawing.store';
import { IconWarning } from '@/shared/components/Icons';
import { Skeleton } from '@/shared/components/Skeleton';
import { formatApprox, formatArea, formatBytes, formatInt } from '@/shared/utils/format';
import { useGenerateStore } from '../generate.store';

const Card = styled.div<{ $loading: boolean }>`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px 8px;
  padding: 8px 10px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  transition: opacity var(--duration-base) var(--easing-standard);
  ${({ $loading }) =>
    $loading &&
    css`
      opacity: 0.6;
    `}
`;

const Cell = styled.div`
  min-width: 0;
  small {
    display: block;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    margin-bottom: 1px;
  }
  strong {
    display: block;
    font-family: var(--font-mono);
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Warning = styled.div`
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-danger-muted);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  line-height: 1.4;
  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const Placeholder = styled.div`
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.4;
`;

/** Compact estimate stats for the sticky generate footer: area, tiles, size, build. */
export function EstimateCard() {
  const estimate = useGenerateStore((s) => s.estimate);
  const status = useGenerateStore((s) => s.estimateStatus);
  const error = useGenerateStore((s) => s.estimateError);
  const selection = useDrawingStore((s) => s.selection);
  const areaKm2 = useMemo(() => selectionAreaKm2(selection), [selection]);

  if (!selection) return <Placeholder>Select an area to estimate tiles, size and build time.</Placeholder>;
  if (status === 'error') {
    return (
      <Warning>
        <IconWarning size={14} />
        <span>Estimate failed: {error}</span>
      </Warning>
    );
  }
  if (!estimate) {
    return (
      <Card $loading>
        {[0, 1, 2, 3].map((i) => (
          <Cell key={i}>
            <Skeleton $w="40%" $h="8px" style={{ marginBottom: 6 }} />
            <Skeleton $w="70%" $h="14px" />
          </Cell>
        ))}
      </Card>
    );
  }

  const methodLabel = { 'exact-source': 'measured', 'sampled-source': 'sampled', historical: 'historical', fallback: 'default' }[estimate.method];

  return (
    <Card $loading={status === 'loading'} aria-busy={status === 'loading'} title={`Estimate · ${methodLabel}`}>
      <Cell>
        <small>Area</small>
        <strong>{formatArea(areaKm2)}</strong>
      </Cell>
      <Cell>
        <small>Tiles</small>
        <strong>{formatInt(estimate.tiles)}</strong>
      </Cell>
      <Cell>
        <small>Size</small>
        <strong>~{formatBytes(estimate.estimatedBytes, 1)}</strong>
      </Cell>
      <Cell>
        <small>Build</small>
        <strong>{formatApprox(estimate.estimatedGenerationMs)}</strong>
      </Cell>
      {estimate.limits.exceedsTileLimit && (
        <Warning>
          <IconWarning size={14} />
          <span>
            {formatInt(estimate.tiles)} tiles exceeds the limit of {formatInt(estimate.limits.maxTiles)}. Reduce the area or the maximum zoom.
          </span>
        </Warning>
      )}
      {estimate.limits.exceedsZoomLimit && (
        <Warning>
          <IconWarning size={14} />
          <span>Maximum zoom exceeds the dataset limit (Z{estimate.limits.maxZoom}).</span>
        </Warning>
      )}
    </Card>
  );
}

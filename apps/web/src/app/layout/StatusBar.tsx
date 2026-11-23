import styled from 'styled-components';
import { selectDatasetReady, useDatasetStore } from '@/modules/dataset/dataset.store';
import { useGenerateStore } from '@/modules/generate/generate.store';
import { selectCurrentProgress, useQueueStore } from '@/modules/queue/queue.store';
import { ProgressBar } from '@/shared/components/ProgressBar';
import { StatusIndicator } from '@/shared/components/StatusIndicator';
import {
  mapOverlayRadius,
  mapOverlaySurface,
  mapOverlayText,
  mapOverlayTextMuted,
} from '@/shared/styles/overlay';
import { formatApprox, formatDuration, formatInt, formatPercent, formatRate } from '@/shared/utils/format';

const Root = styled.div`
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-map-overlay);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(560px, calc(100% - var(--layout-right-panel-width) - 48px));
  min-height: 40px;
  padding: 8px 14px;
  border-radius: ${mapOverlayRadius};
  color: ${mapOverlayText};
  ${mapOverlaySurface}
`;

const Job = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 280px;
  width: 100%;
  text-align: left;
  color: inherit;
`;

const JobName = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  max-width: 140px;
  strong {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: ${mapOverlayText};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Bar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const BarMeta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: ${mapOverlayTextMuted};
  font-variant-numeric: tabular-nums;
  span b {
    color: ${mapOverlayText};
    font-weight: var(--font-weight-medium);
  }
`;

const Pct = styled.div`
  font-family: var(--font-mono);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.02em;
  min-width: 44px;
  text-align: right;
  color: ${mapOverlayText};
  font-variant-numeric: tabular-nums;
`;

const Idle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${mapOverlayText};
  font-size: var(--font-size-sm);
  white-space: nowrap;
`;

export function StatusBar() {
  const current = useQueueStore((s) => s.current);
  const progress = useQueueStore(selectCurrentProgress);
  const queued = useQueueStore((s) => s.queue.length);
  const datasetReady = useDatasetStore(selectDatasetReady);
  const datasetReason = useDatasetStore((s) => (s.info && !s.info.ready ? s.info.reason : null));
  const queueWaitMs = useGenerateStore((s) => s.estimate?.estimatedQueueWaitMs ?? 0);

  const total = progress?.total || current?.tileCount || 0;
  const completed = progress?.completed ?? current?.completedTiles ?? 0;
  const ratio = total > 0 ? completed / total : 0;
  const packaging = current?.status === 'PACKAGING';
  const showQueueWait = queueWaitMs > 0;

  return (
    <Root>
      {current ? (
        <Job aria-label={`Generation ${current.status.toLowerCase()}: ${current.name}`}>
          <JobName>
            <StatusIndicator tone="active" label={current.status} size="sm" />
            <strong>{current.name}</strong>
          </JobName>
          <Bar>
            <ProgressBar value={packaging ? 1 : ratio} active indeterminate={packaging || total === 0} tone={packaging ? 'success' : 'accent'} height={4} />
            <BarMeta>
              <span>
                <b>{formatInt(completed)}</b> / {formatInt(total)}
                {queued > 0 && ` · ${queued} q`}
                {showQueueWait && ` · wait ${formatApprox(queueWaitMs)}`}
              </span>
              <span>
                {formatRate(progress?.tilesPerSecond)} · ETA <b>{packaging ? '—' : formatDuration(progress?.etaMs)}</b>
              </span>
            </BarMeta>
          </Bar>
          <Pct>{packaging ? '···' : formatPercent(ratio)}</Pct>
        </Job>
      ) : (
        <Idle>
          {datasetReady ? (
            <StatusIndicator tone={showQueueWait || queued > 0 ? 'queued' : 'ready'} label={showQueueWait || queued > 0 ? 'Queued' : 'Ready'} pulse={false} size="sm" />
          ) : (
            <StatusIndicator
              tone={datasetReason === 'building' ? 'active' : 'warning'}
              label={datasetReason === 'building' ? 'Building' : 'No dataset'}
              pulse={datasetReason === 'building'}
              size="sm"
            />
          )}
          <span>
            {!datasetReady
              ? datasetReason === 'building'
                ? 'Building master dataset…'
                : 'Dataset not initialized'
              : showQueueWait
                ? `Queue wait ${formatApprox(queueWaitMs)}${queued > 0 ? ` · ${queued} job${queued > 1 ? 's' : ''} ahead` : ''}`
                : queued > 0
                  ? `${queued} job${queued > 1 ? 's' : ''} queued`
                  : 'Select an area to generate'}
          </span>
        </Idle>
      )}
    </Root>
  );
}

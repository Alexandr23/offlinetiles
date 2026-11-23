import type { Generation } from '@map-exporter/contracts';
import styled from 'styled-components';
import { useAuthStore } from '@/modules/auth/auth.store';
import { useDrawingStore } from '@/modules/drawing/drawing.store';
import { useGenerateStore } from '@/modules/generate/generate.store';
import { useMapStore } from '@/modules/map/map.store';
import { JobCard } from '@/modules/queue/components/JobCard';
import { useQueueStore } from '@/modules/queue/queue.store';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { IconButton } from '@/shared/components/IconButton';
import { IconCopy, IconDownload, IconRetry, IconTrash } from '@/shared/components/Icons';
import { PanelBody } from '@/shared/components/Panel';
import { EmptyState, Skeleton } from '@/shared/components/Skeleton';
import { api } from '@/shared/api/endpoints';
import { formatBytes, formatDuration, formatInt, formatRelative } from '@/shared/utils/format';
import { geometryBounds } from '@map-exporter/contracts';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 10px;
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
`;

const ErrorText = styled.div`
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-danger-muted);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  line-height: 1.4;
  word-break: break-word;
  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    opacity: 0.8;
  }
`;

export function HistoryPanel() {
  const history = useQueueStore((s) => s.history);
  const status = useQueueStore((s) => s.status);
  const recentlyCompleted = useQueueStore((s) => s.recentlyCompleted);
  const pushToast = useUiStore((s) => s.pushToast);
  const setRightTab = useUiStore((s) => s.setRightTab);

  const duplicate = (job: Generation) => {
    useGenerateStore.getState().populateFrom(job);
    useDrawingStore.getState().loadSelection(job.selection);
    const map = useMapStore.getState().map;
    if (map) map.fitBounds(geometryBounds(job.selection.geometry), { padding: 80, duration: 600 });
    setRightTab('generate');
    pushToast({ tone: 'info', title: 'Settings loaded', message: `${job.name} — adjust and generate` });
  };

  const retry = async (job: Generation) => {
    try {
      await api.generations.retry(job.id);
      await useAuthStore.getState().refresh();
      pushToast({ tone: 'success', title: 'Retry queued', message: job.name });
    } catch (e) {
      toastError('Retry failed', e);
      await useAuthStore.getState().refresh();
    }
  };

  const remove = async (job: Generation) => {
    try {
      await api.generations.delete(job.id);
      useQueueStore.getState().handleEvent({ type: 'generation.deleted', data: { id: job.id } });
      pushToast({ tone: 'info', title: 'Deleted', message: job.name });
    } catch (e) {
      toastError('Delete failed', e);
    }
  };

  if (status === 'loading') {
    return (
      <PanelBody>
        <List>
          <Skeleton $h="80px" />
          <Skeleton $h="80px" />
        </List>
      </PanelBody>
    );
  }

  return (
    <PanelBody>
      {history.length === 0 ? (
        <EmptyState>
          <strong>No history yet</strong>
          Completed, failed and cancelled generations appear here with download and retry actions.
        </EmptyState>
      ) : (
        <List>
          {history.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              leaving={recentlyCompleted.includes(job.id)}
              actions={
                <>
                  {job.status === 'COMPLETED' && job.hasArtifact && (
                    <IconButton label="Download map.mbtiles" size="sm" tone="accent" onClick={() => window.open(api.generations.downloadUrl(job.id), '_blank')}>
                      <IconDownload />
                    </IconButton>
                  )}
                  {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
                    <IconButton label="Retry" size="sm" onClick={() => retry(job)}>
                      <IconRetry />
                    </IconButton>
                  )}
                  <IconButton label="Duplicate settings" size="sm" onClick={() => duplicate(job)}>
                    <IconCopy />
                  </IconButton>
                  <IconButton label="Delete" size="sm" tone="danger" onClick={() => remove(job)}>
                    <IconTrash />
                  </IconButton>
                </>
              }
            >
              <Row>
                <span>{formatInt(job.tileCount)} tiles</span>
                {job.actualSize !== null && <span>{formatBytes(job.actualSize, 1)}</span>}
                {job.actualDurationMs !== null && <span>{formatDuration(job.actualDurationMs)}</span>}
                <span>{formatRelative(job.completedAt ?? job.createdAt)}</span>
              </Row>
              {job.error && (
                <ErrorText>
                  <code>{job.error.code}</code> {job.error.message}
                </ErrorText>
              )}
            </JobCard>
          ))}
        </List>
      )}
    </PanelBody>
  );
}

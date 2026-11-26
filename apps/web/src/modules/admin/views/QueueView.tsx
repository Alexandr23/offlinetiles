import type { GenerationStatus } from '@map-exporter/contracts';
import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { IconStop } from '@/shared/components/Icons';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { GenerationStatusBadge } from '@/shared/components/StatusIndicator';
import { formatApprox, formatBytes, formatDateTime, formatDuration, formatInt, formatRelative, formatZoomRange } from '@/shared/utils/format';
import { displayName, estimatedWaitMs, summarizeHistory } from '../admin.stats';
import type { AdminViewProps } from '../admin.types';
import {
  Card,
  CardHead,
  CardHint,
  CardTitle,
  Count,
  Empty,
  Grid,
  LiveJob,
  Mono,
  OwnerTag,
  Pill,
  RowActions,
  SearchField,
  Spacer,
  Table,
  TableWrap,
  Toolbar,
} from '../admin.ui';

const PAGE = 50;

type HistoryFilter = 'all' | Extract<GenerationStatus, 'COMPLETED' | 'FAILED' | 'CANCELLED'>;

const WaitList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 460px;
  overflow-y: auto;
`;

const WaitItem = styled.li`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(9, 12, 17, 0.5);
  transition: border-color var(--duration-fast) var(--easing-standard);
  &:hover {
    border-color: var(--color-border-strong);
  }
`;

const Position = styled.span`
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--color-surface-active);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
`;

const WaitBody = styled.div`
  min-width: 0;
  strong {
    display: block;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const WaitMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
`;

const NameCell = styled.td`
  max-width: 280px;
  strong {
    display: block;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  small {
    display: block;
    margin-top: 2px;
    color: var(--color-danger);
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export function QueueView({ data, progress, userById, cancelJob }: AdminViewProps) {
  const { current, queue, history } = data;
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const summary = useMemo(() => summarizeHistory(history), [history]);
  const wait = estimatedWaitMs(queue);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((job) => {
      if (filter !== 'all' && job.status !== filter) return false;
      if (!q) return true;
      const owner = job.userId ? userById.get(job.userId) : undefined;
      return [job.name, job.id, job.styleName, owner && displayName(owner), owner?.login]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [history, filter, query, userById]);

  return (
    <>
      <Grid $cols="minmax(0, 1.2fr) minmax(0, 1fr)" style={{ marginBottom: 16 }}>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Now rendering</CardTitle>
              <CardHint>One job renders at a time; the rest wait in FIFO order.</CardHint>
            </div>
          </CardHead>
          <LiveJob
            job={current}
            progress={progress}
            owner={current && <OwnerTag userId={current.userId} userById={userById} />}
            onCancel={(j) => void cancelJob(j)}
          />
        </Card>

        <Card $delay={60}>
          <CardHead>
            <div>
              <CardTitle>
                Waiting <Count>{queue.length}</Count>
              </CardTitle>
              <CardHint>{queue.length > 0 && wait > 0 ? `About ${formatApprox(wait).replace('~', '')} of work queued.` : 'Jobs waiting for the renderer.'}</CardHint>
            </div>
          </CardHead>
          {queue.length === 0 ? (
            <Empty>
              <strong>Queue is empty</strong>
              New generations start immediately.
            </Empty>
          ) : (
            <WaitList>
              {queue.map((job) => (
                <WaitItem key={job.id}>
                  <Position>{job.queuePosition ?? '·'}</Position>
                  <WaitBody>
                    <strong title={job.name}>{job.name}</strong>
                    <WaitMeta>
                      <OwnerTag userId={job.userId} userById={userById} />
                      <span>{formatInt(job.tileCount)} tiles</span>
                      <span>{formatBytes(job.estimatedSize, 1)}</span>
                      <span>{formatZoomRange(job.minZoom, job.maxZoom)}</span>
                      <span>{formatRelative(job.createdAt)}</span>
                    </WaitMeta>
                  </WaitBody>
                  <RowActions>
                    <IconButton label="Cancel" tone="danger" size="sm" onClick={() => void cancelJob(job)}>
                      <IconStop />
                    </IconButton>
                  </RowActions>
                </WaitItem>
              ))}
            </WaitList>
          )}
        </Card>
      </Grid>

      <Card $delay={120}>
        <CardHead>
          <div>
            <CardTitle>
              History <Count>{history.length}</Count>
            </CardTitle>
            <CardHint>The latest finished generations across all users.</CardHint>
          </div>
        </CardHead>
        <Toolbar>
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setLimit(PAGE);
            }}
            options={[
              { value: 'all', label: `All ${history.length}` },
              { value: 'COMPLETED', label: `Completed ${summary.completed}` },
              { value: 'FAILED', label: `Failed ${summary.failed}` },
              { value: 'CANCELLED', label: `Cancelled ${summary.cancelled}` },
            ]}
            aria-label="Filter by status"
          />
          <Spacer />
          <SearchField value={query} onChange={setQuery} placeholder="Search name, user, style…" />
        </Toolbar>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Owner</th>
                <th>Zoom</th>
                <th className="num">Tiles</th>
                <th className="num">Size</th>
                <th className="num">Duration</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((job) => (
                <tr key={job.id}>
                  <td>
                    <GenerationStatusBadge status={job.status} size="sm" />
                  </td>
                  <NameCell>
                    <strong title={job.name}>{job.name}</strong>
                    {job.error && <small title={job.error.message}>{job.error.message}</small>}
                  </NameCell>
                  <td>
                    <OwnerTag userId={job.userId} userById={userById} />
                  </td>
                  <td>
                    <Pill>{formatZoomRange(job.minZoom, job.maxZoom)}</Pill>
                  </td>
                  <td className="num">{formatInt(job.tileCount)}</td>
                  <td className="num">{formatBytes(job.actualSize ?? job.estimatedSize, 1)}</td>
                  <td className="num">{formatDuration(job.actualDurationMs)}</td>
                  <td title={formatDateTime(job.completedAt)}>
                    <Mono>{formatRelative(job.completedAt ?? job.createdAt)}</Mono>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <Empty>{history.length === 0 ? 'No finished generations yet' : 'Nothing matches these filters'}</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableWrap>
        {filtered.length > limit && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <Button size="sm" variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, filtered.length - limit)} more
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

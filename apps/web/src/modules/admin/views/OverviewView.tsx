import { INTENDED_USE_OPTIONS } from '@map-exporter/contracts';
import { useMemo } from 'react';
import styled from 'styled-components';
import { Button } from '@/shared/components/Button';
import { IconCheck, IconChevronRight, IconGrid, IconMail, IconQueue, IconUser, IconZap } from '@/shared/components/Icons';
import { statusTone } from '@/shared/components/StatusIndicator';
import { formatApprox, formatBytes, formatInt, formatPercent, formatRelative } from '@/shared/utils/format';
import { activeSince, estimatedWaitMs, jobsPerDay, summarizeHistory, tallyOptions } from '../admin.stats';
import type { AdminViewProps } from '../admin.types';
import { Card, CardHead, CardHint, CardTitle, ColumnChart, Count, Empty, Grid, LiveJob, Mono, OwnerTag, StatCard, Tally } from '../admin.ui';

const DAY = 86_400_000;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
`;

const Column = styled.div`
  display: grid;
  gap: 16px;
  min-width: 0;
`;

const Feed = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
`;

const FeedItem = styled.li<{ $tone: string }>`
  position: relative;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 4px 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border-subtle);
  &:last-child {
    border-bottom: 0;
  }
  &::before {
    content: '';
    grid-row: 1 / span 2;
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border-radius: 50%;
    background: ${({ $tone }) => $tone};
    box-shadow: 0 0 10px ${({ $tone }) => $tone};
  }
  strong {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const FeedMeta = styled.div`
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
`;

const UpNext = styled.ol`
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(9, 12, 17, 0.45);
    border: 1px solid var(--color-border-subtle);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
  b {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }
  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const toneColor = {
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  muted: 'var(--color-text-muted)',
  active: 'var(--color-accent)',
  queued: 'var(--color-text-secondary)',
  ready: 'var(--color-success)',
  warning: 'var(--color-warning)',
} as const;

export function OverviewView({ data, progress, go, userById, cancelJob }: AdminViewProps) {
  const { users, queue, current, history, interest, interestTotal } = data;
  const summary = useMemo(() => summarizeHistory(history), [history]);
  const perDay = useMemo(() => jobsPerDay(history, 14), [history]);
  const roleCounts = useMemo(() => {
    const c = { admin: 0, user: 0, guest: 0 };
    for (const u of users) c[u.role]++;
    return c;
  }, [users]);
  const uses = useMemo(
    () => tallyOptions(INTENDED_USE_OPTIONS, interest.map((r) => r.intendedUse)).sort((a, b) => b.count - a.count),
    [interest],
  );
  const wantUpdates = interest.filter((r) => r.marketingConsent).length;
  const wait = estimatedWaitMs(queue);

  return (
    <>
      <StatGrid>
        <StatCard
          label="Users"
          value={users.length}
          icon={<IconUser size={15} />}
          sub={`${roleCounts.user} accounts · ${roleCounts.guest} guests`}
          onClick={() => go('users')}
        />
        <StatCard
          label="Active today"
          value={activeSince(users, DAY)}
          icon={<IconZap size={15} />}
          accent="var(--color-success)"
          sub={`${activeSince(users, 7 * DAY)} in the last 7 days`}
          delay={40}
        />
        <StatCard
          label="In queue"
          value={queue.length}
          icon={<IconQueue size={15} />}
          accent="var(--color-warning)"
          sub={current ? `1 rendering${wait ? ` · ${formatApprox(wait)} wait` : ''}` : 'Renderer idle'}
          delay={80}
          onClick={() => go('queue')}
        />
        <StatCard
          label="Completed"
          value={summary.completed}
          icon={<IconCheck size={15} />}
          accent="var(--color-success)"
          sub={
            summary.successRate == null
              ? 'No finished jobs yet'
              : `${formatPercent(summary.successRate)} success · ${summary.failed} failed`
          }
          delay={120}
        />
        <StatCard
          label="Tiles rendered"
          value={summary.tiles}
          icon={<IconGrid size={15} />}
          accent="var(--color-info)"
          sub={`${formatBytes(summary.bytes, 1)} exported`}
          delay={160}
        />
        <StatCard
          label="Contacts"
          value={interestTotal}
          icon={<IconMail size={15} />}
          accent="var(--color-selection)"
          sub={`${wantUpdates} want updates`}
          delay={200}
          onClick={() => go('contacts')}
        />
      </StatGrid>

      <Grid $cols="minmax(0, 1.55fr) minmax(0, 1fr)">
        <Column>
          <Card $delay={120}>
            <CardHead>
              <div>
                <CardTitle>Now rendering</CardTitle>
                <CardHint>Live progress from the render worker.</CardHint>
              </div>
              <Button size="sm" variant="ghost" iconRight={<IconChevronRight />} onClick={() => go('queue')}>
                Queue
              </Button>
            </CardHead>
            <LiveJob
              job={current}
              progress={progress}
              owner={current && <OwnerTag userId={current.userId} userById={userById} />}
              onCancel={(j) => void cancelJob(j)}
            />
            {queue.length > 0 && (
              <UpNext>
                {queue.slice(0, 3).map((job) => (
                  <li key={job.id}>
                    <b>#{job.queuePosition ?? '·'}</b>
                    <span title={job.name}>{job.name}</span>
                    <Mono>{formatInt(job.tileCount)} tiles</Mono>
                  </li>
                ))}
                {queue.length > 3 && (
                  <Mono style={{ textAlign: 'center', paddingTop: 2 }}>+{queue.length - 3} more waiting</Mono>
                )}
              </UpNext>
            )}
          </Card>

          <Card $delay={180}>
            <CardHead>
              <div>
                <CardTitle>Throughput</CardTitle>
                <CardHint>Finished generations per day, last 14 days.</CardHint>
              </div>
              {summary.avgDurationMs != null && <Mono>avg run {formatApprox(summary.avgDurationMs)}</Mono>}
            </CardHead>
            <ColumnChart
              data={perDay}
              series={[
                { key: 'completed', label: 'Completed', color: 'var(--color-accent)' },
                { key: 'failed', label: 'Failed', color: 'var(--color-danger)' },
                { key: 'cancelled', label: 'Cancelled', color: 'rgba(148, 176, 204, 0.45)' },
              ]}
            />
          </Card>
        </Column>

        <Column>
          <Card $delay={160}>
            <CardHead>
              <CardTitle>
                Recent activity <Count>{history.length}</Count>
              </CardTitle>
            </CardHead>
            {history.length === 0 ? (
              <Empty>
                <strong>No finished jobs yet</strong>
                Completed, failed and cancelled generations show up here.
              </Empty>
            ) : (
              <Feed>
                {history.slice(0, 7).map((job) => (
                  <FeedItem key={job.id} $tone={toneColor[statusTone(job.status)]}>
                    <strong title={job.name}>{job.name}</strong>
                    <Mono>{formatRelative(job.completedAt ?? job.createdAt)}</Mono>
                    <FeedMeta>
                      <OwnerTag userId={job.userId} userById={userById} />
                      <span>
                        {job.status === 'COMPLETED'
                          ? `${formatInt(job.tileCount)} tiles · ${formatBytes(job.actualSize, 1)}`
                          : job.status.toLowerCase()}
                      </span>
                    </FeedMeta>
                  </FeedItem>
                ))}
              </Feed>
            )}
          </Card>

          <Card $delay={220}>
            <CardHead>
              <div>
                <CardTitle>Who&apos;s interested</CardTitle>
                <CardHint>Intended use from the landing contact form.</CardHint>
              </div>
              <Button size="sm" variant="ghost" iconRight={<IconChevronRight />} onClick={() => go('contacts')}>
                All
              </Button>
            </CardHead>
            {interest.length === 0 ? (
              <Empty>No submissions yet</Empty>
            ) : (
              <Tally items={uses.filter((u) => u.count > 0).slice(0, 5)} color="#ff85b3" />
            )}
          </Card>
        </Column>
      </Grid>
    </>
  );
}

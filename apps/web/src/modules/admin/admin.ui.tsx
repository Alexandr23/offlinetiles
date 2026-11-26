import type { AdminUserRow, Generation, GenerationProgress, UserRole } from '@map-exporter/contracts';
import type { ReactNode } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { IconButton } from '@/shared/components/IconButton';
import { IconSearch, IconStop } from '@/shared/components/Icons';
import { ProgressBar } from '@/shared/components/ProgressBar';
import { GenerationStatusBadge } from '@/shared/components/StatusIndicator';
import { useSmoothNumber } from '@/shared/hooks/useSmoothNumber';
import { formatApprox, formatBytes, formatDuration, formatInt, formatRate, formatZoomRange } from '@/shared/utils/format';
import { displayName, initials } from './admin.stats';

export const rise = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const grow = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`;

export const Card = styled.section<{ $delay?: number }>`
  position: relative;
  min-width: 0;
  padding: 18px 20px 20px;
  border-radius: 14px;
  border: 1px solid var(--color-border-subtle);
  background: linear-gradient(180deg, rgba(25, 34, 45, 0.78) 0%, rgba(14, 19, 26, 0.78) 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 14px 36px rgba(0, 0, 0, 0.32);
  animation: ${rise} 420ms var(--easing-emphasized) both;
  animation-delay: ${({ $delay = 0 }) => $delay}ms;
`;

export const CardHead = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
`;

export const CardTitle = styled.h2`
  margin: 0;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const CardHint = styled.p`
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
`;

export const Count = styled.span`
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-surface-active);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0;
`;

export const Grid = styled.div<{ $cols?: string; $gap?: number }>`
  display: grid;
  grid-template-columns: ${({ $cols = '1fr' }) => $cols};
  gap: ${({ $gap = 16 }) => $gap}px;
  align-items: start;
  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

export const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
`;

export const Spacer = styled.div`
  flex: 1;
`;

const SearchRoot = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  max-width: 340px;
  svg {
    position: absolute;
    left: 10px;
    color: var(--color-text-muted);
    pointer-events: none;
  }
  input {
    width: 100%;
    height: 30px;
    padding: 0 10px 0 32px;
    border-radius: 8px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(9, 12, 17, 0.6);
    color: var(--color-text-primary);
    outline: none;
    transition:
      border-color var(--duration-fast) var(--easing-standard),
      box-shadow var(--duration-fast) var(--easing-standard);
    &::placeholder {
      color: var(--color-text-muted);
    }
    &:focus {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px var(--color-accent-muted);
    }
  }
`;

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <SearchRoot>
      <IconSearch size={14} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </SearchRoot>
  );
}

const roleColors: Record<UserRole, { fg: string; bg: string; border: string }> = {
  admin: { fg: '#c4ccff', bg: 'rgba(143, 156, 255, 0.18)', border: 'rgba(168, 180, 255, 0.35)' },
  user: { fg: '#7fdfff', bg: 'rgba(79, 209, 255, 0.14)', border: 'rgba(79, 209, 255, 0.35)' },
  guest: { fg: '#c2d0e0', bg: 'rgba(148, 176, 204, 0.12)', border: 'rgba(148, 176, 204, 0.28)' },
};

export const RoleBadge = styled.span<{ $role: UserRole }>`
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $role }) => roleColors[$role].fg};
  background: ${({ $role }) => roleColors[$role].bg};
  border: 1px solid ${({ $role }) => roleColors[$role].border};
`;

const AvatarRoot = styled.span<{ $role: UserRole; $size: number }>`
  flex: none;
  display: inline-grid;
  place-items: center;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: ${({ $size }) => Math.round($size * 0.3)}px;
  font-size: ${({ $size }) => Math.round($size * 0.38)}px;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.02em;
  color: ${({ $role }) => roleColors[$role].fg};
  background: ${({ $role }) => roleColors[$role].bg};
  border: 1px solid ${({ $role }) => roleColors[$role].border};
`;

export function Avatar({ name, role, size = 30 }: { name: string; role: UserRole; size?: number }) {
  return (
    <AvatarRoot $role={role} $size={size} aria-hidden>
      {initials(name)}
    </AvatarRoot>
  );
}

export const Pill = styled.span<{ $tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'info' }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10.5px;
  white-space: nowrap;
  ${({ $tone = 'muted' }) => {
    const map = {
      accent: ['var(--color-accent)', 'var(--color-accent-muted)'],
      success: ['var(--color-success)', 'var(--color-success-muted)'],
      warning: ['var(--color-warning)', 'var(--color-warning-muted)'],
      danger: ['var(--color-danger)', 'var(--color-danger-muted)'],
      info: ['var(--color-info)', 'rgba(139, 156, 255, 0.16)'],
      muted: ['var(--color-text-secondary)', 'rgba(148, 176, 204, 0.12)'],
    } as const;
    const [fg, bg] = map[$tone];
    return css`
      color: ${fg};
      background: ${bg};
    `;
  }}
`;

export const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
`;

export const Empty = styled.div`
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 32px 12px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  strong {
    color: var(--color-text-secondary);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }
`;

export const TableWrap = styled.div`
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(9, 12, 17, 0.55);
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
  th,
  td {
    padding: 10px 12px;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid var(--color-border-subtle);
    vertical-align: middle;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    font-size: 9.5px;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    background: #121922;
  }
  td {
    color: var(--color-text-secondary);
  }
  tbody tr {
    transition: background var(--duration-fast) var(--easing-standard);
  }
  tbody tr:hover {
    background: rgba(79, 209, 255, 0.04);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  td.num,
  th.num {
    text-align: right;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
`;

export const SortHeader = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'inherit')};
  &:hover {
    color: var(--color-text-primary);
  }
`;

export const RowActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0.6;
  transition: opacity var(--duration-fast) var(--easing-standard);
  tr:hover &,
  article:hover &,
  &:focus-within {
    opacity: 1;
  }
`;

export function OwnerTag({ userId, userById }: { userId: string | null; userById: ReadonlyMap<string, AdminUserRow> }) {
  if (!userId) return <Mono>—</Mono>;
  const owner = userById.get(userId);
  if (!owner) return <Mono title={userId}>{userId.slice(0, 8)}</Mono>;
  const name = displayName(owner);
  return (
    <OwnerRoot title={`${name} · ${owner.role} · ${owner.id}`}>
      <Avatar name={name} role={owner.role} size={18} />
      <span>{name}</span>
    </OwnerRoot>
  );
}

const OwnerRoot = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 180px;
  color: var(--color-text-secondary);
  span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

/* ---------- Stat tiles ---------- */

const StatRoot = styled(Card)<{ $accent: string }>`
  padding: 16px 18px;
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: -40% -30% auto auto;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, ${({ $accent }) => $accent} 0%, transparent 65%);
    opacity: 0.16;
    pointer-events: none;
  }
`;

const StatTop = styled.div<{ $accent: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  span:last-child {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: ${({ $accent }) => $accent};
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--color-border-subtle);
  }
`;

const StatValue = styled.div`
  margin-top: 10px;
  font-size: 28px;
  line-height: 1.1;
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.02em;
  color: #f2f6fb;
  font-variant-numeric: tabular-nums;
`;

const StatSub = styled.div`
  margin-top: 6px;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export function StatCard({
  label,
  value,
  format = formatInt,
  sub,
  icon,
  accent = 'var(--color-accent)',
  delay,
  onClick,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  sub?: ReactNode;
  icon: ReactNode;
  accent?: string;
  delay?: number;
  onClick?: () => void;
}) {
  const shown = useSmoothNumber(value, 900);
  return (
    <StatRoot
      $accent={accent}
      $delay={delay}
      as={onClick ? 'button' : 'section'}
      onClick={onClick}
      style={onClick ? { textAlign: 'left', cursor: 'pointer', width: '100%' } : undefined}
    >
      <StatTop $accent={accent}>
        <span>{label}</span>
        <span>{icon}</span>
      </StatTop>
      <StatValue>{format(shown)}</StatValue>
      {sub && <StatSub>{sub}</StatSub>}
    </StatRoot>
  );
}

/* ---------- Horizontal tally bars ---------- */

const TallyRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 10px;
  align-items: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  & + & {
    margin-top: 10px;
  }
`;

const TallyTrack = styled.div`
  grid-column: 1 / -1;
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 176, 204, 0.1);
  overflow: hidden;
`;

const TallyFill = styled.div<{ $color: string }>`
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, ${({ $color }) => $color}, ${({ $color }) => $color}cc);
  transform-origin: left;
  transition: width 700ms var(--easing-emphasized);
`;

export function Tally({ items, color = '#4fd1ff' }: { items: { id: string; label: string; count: number }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((n, i) => n + i.count, 0);
  return (
    <div>
      {items.map((i) => (
        <TallyRow key={i.id}>
          <span>{i.label}</span>
          <Mono>
            {i.count}
            {total > 0 && <> · {Math.round((i.count / total) * 100)}%</>}
          </Mono>
          <TallyTrack>
            <TallyFill $color={color} style={{ width: `${(i.count / max) * 100}%` }} />
          </TallyTrack>
        </TallyRow>
      ))}
    </div>
  );
}

/* ---------- Column chart ---------- */

const Chart = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  align-items: end;
  gap: 6px;
  height: 150px;
  padding-top: 8px;
`;

const Column = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  border-radius: 4px;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 4px;
    background: rgba(148, 176, 204, 0.05);
  }
  &:hover::before {
    background: rgba(148, 176, 204, 0.1);
  }
`;

const Segment = styled.div<{ $color: string; $delay: number }>`
  position: relative;
  border-radius: 3px;
  background: ${({ $color }) => $color};
  transform-origin: bottom;
  animation: ${grow} 700ms var(--easing-emphasized) both;
  animation-delay: ${({ $delay }) => $delay}ms;
`;

const ChartAxis = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 6px;
  margin-top: 6px;
  span {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-text-muted);
    text-align: center;
    white-space: nowrap;
  }
`;

const Legend = styled.div`
  display: flex;
  gap: 14px;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  i {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 2px;
  }
`;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export function ColumnChart({
  data,
  series,
}: {
  data: readonly ({ start: number } & Record<string, number>)[];
  series: ChartSeries[];
}) {
  const totals = data.map((d) => series.reduce((n, s) => n + (d[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  return (
    <div>
      <Chart role="img" aria-label="Finished generations per day">
        {data.map((d, i) => {
          const tip = `${dayFmt.format(d.start)}: ${series.map((s) => `${d[s.key] ?? 0} ${s.label.toLowerCase()}`).join(', ')}`;
          return (
            <Column key={d.start} title={tip}>
              {series.map((s) => {
                const v = d[s.key] ?? 0;
                if (!v) return null;
                return <Segment key={s.key} $color={s.color} $delay={i * 25} style={{ height: `${(v / max) * 100}%` }} />;
              })}
            </Column>
          );
        })}
      </Chart>
      <ChartAxis>
        {data.map((d, i) => (
          <span key={d.start}>{i % 2 === (data.length - 1) % 2 ? dayFmt.format(d.start) : ''}</span>
        ))}
      </ChartAxis>
      <Legend style={{ marginTop: 12 }}>
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </Legend>
    </div>
  );
}

/* ---------- Live job ---------- */

const LiveRoot = styled.div<{ $active: boolean }>`
  position: relative;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(79, 209, 255, 0.45)' : 'var(--color-border-subtle)')};
  background: ${({ $active }) =>
    $active
      ? 'linear-gradient(135deg, rgba(79, 209, 255, 0.1) 0%, rgba(79, 209, 255, 0.02) 60%), rgba(9, 12, 17, 0.6)'
      : 'rgba(9, 12, 17, 0.55)'};
  box-shadow: ${({ $active }) => ($active ? '0 0 32px rgba(79, 209, 255, 0.12)' : 'none')};
  overflow: hidden;
`;

const LiveHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  h3 {
    margin: 6px 0 0;
    font-size: 16px;
    font-weight: var(--font-weight-semibold);
    color: #f2f6fb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const LiveMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const LiveStats = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0 0;
  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  dt {
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  dd {
    margin: 3px 0 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }
`;

const Percent = styled.div`
  font-size: 30px;
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.02em;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
  line-height: 1;
`;

export function LiveJob({
  job,
  progress,
  owner,
  onCancel,
}: {
  job: Generation | null;
  progress: GenerationProgress | null;
  owner?: ReactNode;
  onCancel?: (job: Generation) => void;
}) {
  const live = job && progress?.id === job.id ? progress : null;
  const total = live?.total ?? job?.tileCount ?? 0;
  const done = live?.completed ?? job?.completedTiles ?? 0;
  const ratio = total > 0 ? done / total : 0;
  const shownPct = useSmoothNumber(ratio * 100, 600);

  if (!job) {
    return (
      <LiveRoot $active={false}>
        <Empty style={{ padding: '18px 8px' }}>
          <strong>Renderer idle</strong>
          Nothing is generating right now. New jobs start here automatically.
        </Empty>
      </LiveRoot>
    );
  }

  const packaging = job.status === 'PACKAGING';
  return (
    <LiveRoot $active>
      <LiveHead>
        <div style={{ minWidth: 0 }}>
          <GenerationStatusBadge status={job.status} size="sm" />
          <h3 title={job.name}>{job.name}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Percent>{packaging ? '—' : `${Math.floor(shownPct)}%`}</Percent>
          {onCancel && (
            <IconButton label="Cancel generation" tone="danger" onClick={() => onCancel(job)}>
              <IconStop />
            </IconButton>
          )}
        </div>
      </LiveHead>
      <LiveMeta>
        {owner}
        <Pill>{job.content}</Pill>
        <Pill>{job.container}</Pill>
        <Pill>{formatZoomRange(job.minZoom, job.maxZoom)}</Pill>
        {job.styleName && <Pill $tone="info">{job.styleName}</Pill>}
      </LiveMeta>
      <div style={{ marginTop: 14 }}>
        <ProgressBar value={ratio} active indeterminate={packaging} height={6} aria-label="generation progress" />
      </div>
      <LiveStats>
        <div>
          <dt>Tiles</dt>
          <dd>
            {formatInt(done)} / {formatInt(total)}
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{formatRate(live?.tilesPerSecond)}</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{formatDuration(live?.elapsedMs ?? (job.startedAt ? Date.now() - Date.parse(job.startedAt) : null))}</dd>
        </div>
        <div>
          <dt>{live?.etaMs != null ? 'ETA' : 'Estimate'}</dt>
          <dd>{formatApprox(live?.etaMs ?? job.estimatedDurationMs)}</dd>
        </div>
      </LiveStats>
      {live && live.bytesWritten > 0 && (
        <Mono style={{ display: 'block', marginTop: 10 }}>{formatBytes(live.bytesWritten, 1)} written</Mono>
      )}
    </LiveRoot>
  );
}

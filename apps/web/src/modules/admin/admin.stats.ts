import type { AdminUserRow, Generation, InterestSubmission } from '@map-exporter/contracts';

const DAY_MS = 86_400_000;

export type DayBucket = {
  /** Local midnight of the day, epoch ms. */
  start: number;
  completed: number;
  failed: number;
  cancelled: number;
};

function localMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Finished generations per local day, oldest first, always `days` buckets long. */
export function jobsPerDay(history: readonly Generation[], days: number, now = Date.now()): DayBucket[] {
  const today = localMidnight(now);
  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    buckets.push({ start: localMidnight(today - i * DAY_MS + DAY_MS / 2), completed: 0, failed: 0, cancelled: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.start, i]));
  for (const job of history) {
    const at = Date.parse(job.completedAt ?? job.createdAt);
    if (!Number.isFinite(at)) continue;
    const bucket = buckets[index.get(localMidnight(at)) ?? -1];
    if (!bucket) continue;
    if (job.status === 'COMPLETED') bucket.completed++;
    else if (job.status === 'FAILED') bucket.failed++;
    else if (job.status === 'CANCELLED') bucket.cancelled++;
  }
  return buckets;
}

export interface HistorySummary {
  completed: number;
  failed: number;
  cancelled: number;
  /** completed / (completed + failed); null when nothing has finished. */
  successRate: number | null;
  tiles: number;
  bytes: number;
  avgDurationMs: number | null;
}

export function summarizeHistory(history: readonly Generation[]): HistorySummary {
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let tiles = 0;
  let bytes = 0;
  let durationTotal = 0;
  let durationCount = 0;
  for (const job of history) {
    if (job.status === 'COMPLETED') {
      completed++;
      tiles += job.tileCount ?? job.completedTiles;
      bytes += job.actualSize ?? 0;
      if (job.actualDurationMs != null) {
        durationTotal += job.actualDurationMs;
        durationCount++;
      }
    } else if (job.status === 'FAILED') failed++;
    else if (job.status === 'CANCELLED') cancelled++;
  }
  const decided = completed + failed;
  return {
    completed,
    failed,
    cancelled,
    successRate: decided > 0 ? completed / decided : null,
    tiles,
    bytes,
    avgDurationMs: durationCount > 0 ? durationTotal / durationCount : null,
  };
}

/** Sum of estimated durations, skipping jobs without an estimate. */
export function estimatedWaitMs(queue: readonly Generation[]): number {
  return queue.reduce((sum, job) => sum + (job.estimatedDurationMs ?? 0), 0);
}

export function activeSince(users: readonly AdminUserRow[], sinceMs: number, now = Date.now()): number {
  return users.filter((u) => now - Date.parse(u.lastSeenAt) <= sinceMs).length;
}

/** Share of the generation quota used, 0..1; null for unlimited or quota-less users. */
export function usageRatio(user: AdminUserRow): number | null {
  const max = user.limits.maxGenerations;
  if (user.limits.unlimited || max == null) return null;
  if (max === 0) return 1;
  return Math.min(1, user.limits.generationsUsed / max);
}

export function displayName(user: Pick<AdminUserRow, 'login' | 'displayName' | 'role'>): string {
  return user.displayName ?? user.login ?? (user.role === 'guest' ? 'Guest' : 'Unnamed');
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

export interface OptionCount {
  id: string;
  label: string;
  count: number;
}

/** Counts how many submissions picked each option, in option order. */
export function tallyOptions(
  options: readonly { id: string; label: string }[],
  values: readonly (string | readonly string[] | null)[],
): OptionCount[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v == null) continue;
    for (const id of typeof v === 'string' ? [v] : v) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 }));
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function interestToCsv(
  rows: readonly InterestSubmission[],
  label: (kind: 'use' | 'feature' | 'pay', id: string) => string,
): string {
  return toCsv([
    ['received', 'email', 'intended_use', 'features', 'pay', 'feedback', 'updates', 'source', 'utm_source', 'utm_campaign', 'generation_id'],
    ...rows.map((r) => [
      r.createdAt,
      r.email ?? '',
      label('use', r.intendedUse),
      r.features.map((f) => label('feature', f)).join('; '),
      r.willingness ? label('pay', r.willingness) : '',
      r.feedback ?? '',
      r.marketingConsent ? 'yes' : 'no',
      r.source ?? '',
      r.utmSource ?? '',
      r.utmCampaign ?? '',
      r.generationId ?? '',
    ]),
  ]);
}

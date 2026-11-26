import type { AdminUserRow, Generation } from '@map-exporter/contracts';
import { describe, expect, it } from 'vitest';
import { initials, jobsPerDay, summarizeHistory, tallyOptions, toCsv, usageRatio } from './admin.stats';

const job = (over: Partial<Generation>): Generation =>
  ({
    id: '00000000-0000-4000-8000-000000000000',
    name: 'job',
    status: 'COMPLETED',
    tileCount: 100,
    completedTiles: 100,
    actualSize: 1000,
    actualDurationMs: 2000,
    createdAt: '2026-11-20T10:00:00.000Z',
    completedAt: '2026-11-20T10:05:00.000Z',
    ...over,
  }) as Generation;

const user = (limits: Partial<AdminUserRow['limits']>): AdminUserRow =>
  ({
    limits: { maxGenerations: 10, maxTiles: null, maxAreaKm2: null, generationsUsed: 0, generationsRemaining: 10, unlimited: false, ...limits },
  }) as AdminUserRow;

describe('summarizeHistory', () => {
  it('counts outcomes and only totals completed jobs', () => {
    const s = summarizeHistory([
      job({}),
      job({ actualDurationMs: 4000 }),
      job({ status: 'FAILED', tileCount: 999, actualSize: 999 }),
      job({ status: 'CANCELLED' }),
    ]);
    expect(s).toMatchObject({ completed: 2, failed: 1, cancelled: 1, tiles: 200, bytes: 2000, avgDurationMs: 3000 });
    expect(s.successRate).toBeCloseTo(2 / 3);
  });

  it('has no success rate when nothing finished', () => {
    expect(summarizeHistory([job({ status: 'CANCELLED' })]).successRate).toBeNull();
  });
});

describe('jobsPerDay', () => {
  it('buckets by local day and drops jobs outside the window', () => {
    const now = new Date(2026, 10, 26, 15, 0).getTime();
    const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
    const buckets = jobsPerDay(
      [
        job({ completedAt: at(26) }),
        job({ completedAt: at(26, 1), status: 'FAILED' }),
        job({ completedAt: at(24), status: 'CANCELLED' }),
        job({ completedAt: at(1) }),
      ],
      7,
      now,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[6]).toMatchObject({ completed: 1, failed: 1, cancelled: 0 });
    expect(buckets[4]).toMatchObject({ cancelled: 1 });
    expect(buckets.reduce((n, b) => n + b.completed, 0)).toBe(1);
  });
});

describe('usageRatio', () => {
  it('is null for unlimited users and clamps at 1', () => {
    expect(usageRatio(user({ unlimited: true }))).toBeNull();
    expect(usageRatio(user({ generationsUsed: 5 }))).toBe(0.5);
    expect(usageRatio(user({ generationsUsed: 50 }))).toBe(1);
    expect(usageRatio(user({ maxGenerations: 0 }))).toBe(1);
  });
});

describe('helpers', () => {
  it('builds initials', () => {
    expect(initials('Jane Doe')).toBe('JD');
    expect(initials('ops.team')).toBe('OT');
    expect(initials('admin')).toBe('AD');
  });

  it('tallies single and multi-select options', () => {
    const opts = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    expect(tallyOptions(opts, ['a', ['a', 'b'], null]).map((o) => o.count)).toEqual([2, 1]);
  });

  it('escapes CSV cells', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'x\ny']])).toBe('a,"b,c","say ""hi""","x\ny"');
  });
});

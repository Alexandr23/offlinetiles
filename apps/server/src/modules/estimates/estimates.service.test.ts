import type { Generation } from '@map-exporter/contracts';
import { describe, expect, it } from 'vitest';
import { remainingMs } from './estimates.service.js';

function job(partial: Partial<Generation>): Generation {
  return {
    id: '7f9c2d6e-4b1a-4c3d-9e8f-0a1b2c3d4e5f',
    name: 'job',
    status: 'GENERATING',
    content: 'vector',
    container: 'mbtiles',
    raster: null,
    minZoom: 0,
    maxZoom: 14,
    selection: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    bounds: [0, 0, 1, 1],
    styleId: null,
    styleName: null,
    tileCount: null,
    completedTiles: 0,
    estimatedBytes: null,
    estimatedDurationMs: null,
    bytes: null,
    errorCode: null,
    errorMessage: null,
    datasetVersion: null,
    createdAt: new Date(0).toISOString(),
    startedAt: null,
    finishedAt: null,
    position: null,
    ...partial,
  } as Generation;
}

describe('remainingMs', () => {
  const now = Date.parse('2026-10-03T12:10:00.000Z');
  const startedAt = '2026-10-03T12:00:00.000Z'; // 10 minutes ago

  it('extrapolates from observed throughput once tiles have completed', () => {
    const j = job({ tileCount: 1000, completedTiles: 250, startedAt, estimatedDurationMs: 1 });
    // 250 tiles in 600 s → 2.4 s/tile → 750 tiles remaining → 1800 s
    expect(remainingMs(j, now)).toBe(750 * (600_000 / 250));
  });

  it('falls back to the pre-run estimate minus elapsed time before progress arrives', () => {
    const j = job({ tileCount: 1000, completedTiles: 0, startedAt, estimatedDurationMs: 900_000 });
    expect(remainingMs(j, now)).toBe(300_000);
    expect(remainingMs(job({ startedAt, estimatedDurationMs: 100_000 }), now)).toBe(0);
  });

  it('returns 0 when nothing is known and never goes negative', () => {
    expect(remainingMs(job({}), now)).toBe(0);
    expect(remainingMs(job({ tileCount: 10, completedTiles: 10, startedAt }), now)).toBe(0);
    expect(remainingMs(job({ startedAt: new Date(now + 60_000).toISOString(), estimatedDurationMs: 1000 }), now)).toBe(
      1000,
    );
  });
});

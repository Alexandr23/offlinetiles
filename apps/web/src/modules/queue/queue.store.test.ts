import type { Generation, SSEEvent } from '@map-exporter/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectCurrentProgress, selectIsBusy, useQueueStore } from './queue.store';

function gen(partial: Partial<Generation> & Pick<Generation, 'id' | 'status'>): Generation {
  return {
    name: 'Monaco',
    selection: {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7.4, 43.7],
            [7.45, 43.7],
            [7.45, 43.75],
            [7.4, 43.75],
            [7.4, 43.7],
          ],
        ],
      },
    },
    minZoom: 8,
    maxZoom: 14,
    content: 'vector',
    container: 'mbtiles',
    raster: null,
    styleId: null,
    styleName: 'Light',
    tileCount: 100,
    completedTiles: 0,
    estimatedSize: 1_000,
    actualSize: null,
    estimatedDurationMs: 1_000,
    actualDurationMs: null,
    hasArtifact: false,
    datasetVersion: 'v1',
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    queuePosition: null,
    userId: null,
    ...partial,
  };
}

const initial = {
  status: 'idle' as const,
  current: null,
  queue: [],
  history: [],
  progress: {},
  version: 0,
  recentlyCompleted: [],
};

describe('queue store SSE projection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useQueueStore.setState({ ...initial });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves a created job into the FIFO queue and a started job into current', () => {
    const queued = gen({ id: '11111111-1111-1111-1111-111111111111', status: 'QUEUED' });
    useQueueStore.getState().handleEvent({ type: 'generation.created', data: queued });
    expect(useQueueStore.getState().queue).toEqual([expect.objectContaining({ id: queued.id, queuePosition: 1 })]);
    expect(selectIsBusy(useQueueStore.getState())).toBe(true);

    const started = { ...queued, status: 'GENERATING' as const, startedAt: '2026-01-01T00:00:01.000Z' };
    useQueueStore.getState().handleEvent({ type: 'generation.started', data: started });
    expect(useQueueStore.getState()).toMatchObject({ current: started, queue: [] });
  });

  it('applies progress only to the matching current job', () => {
    const current = gen({ id: '22222222-2222-2222-2222-222222222222', status: 'GENERATING', startedAt: '2026-01-01T00:00:01.000Z' });
    useQueueStore.setState({ current });
    const progress = { id: current.id, completed: 40, total: 100, bytesWritten: 800, tilesPerSecond: 20, etaMs: 3000, elapsedMs: 2000 };
    useQueueStore.getState().handleEvent({ type: 'generation.progress', data: progress });
    expect(selectCurrentProgress(useQueueStore.getState())).toEqual(progress);
    expect(useQueueStore.getState().current?.completedTiles).toBe(40);
  });

  it('moves a finished job from current into history and clears live progress', () => {
    const current = gen({ id: '33333333-3333-3333-3333-333333333333', status: 'GENERATING' });
    useQueueStore.setState({ current, progress: { [current.id]: { id: current.id, completed: 10, total: 10, bytesWritten: 1, tilesPerSecond: 1, etaMs: 0, elapsedMs: 1 } } });
    const done = { ...current, status: 'COMPLETED' as const, completedAt: '2026-01-01T00:01:00.000Z', hasArtifact: true };
    useQueueStore.getState().handleEvent({ type: 'generation.completed', data: done });
    const state = useQueueStore.getState();
    expect(state.current).toBeNull();
    expect(state.history[0]).toMatchObject({ id: done.id, status: 'COMPLETED' });
    expect(state.progress).toEqual({});
    expect(state.recentlyCompleted).toEqual([done.id]);
    vi.advanceTimersByTime(2500);
    expect(useQueueStore.getState().recentlyCompleted).toEqual([]);
  });

  it('ignores a late create event after the job has already started or finished', () => {
    const id = '55555555-5555-5555-5555-555555555555';
    const queued = gen({ id, status: 'QUEUED' });
    const started = { ...queued, status: 'GENERATING' as const, startedAt: '2026-01-01T00:00:01.000Z' };

    useQueueStore.getState().handleEvent({ type: 'generation.started', data: started });
    useQueueStore.getState().handleEvent({ type: 'generation.created', data: queued });
    expect(useQueueStore.getState()).toMatchObject({ current: started, queue: [] });

    const done = { ...started, status: 'COMPLETED' as const, completedAt: '2026-01-01T00:01:00.000Z', hasArtifact: true };
    useQueueStore.getState().handleEvent({ type: 'generation.completed', data: done });
    useQueueStore.getState().handleEvent({ type: 'generation.created', data: queued });
    expect(useQueueStore.getState().queue).toEqual([]);
    expect(useQueueStore.getState().history[0]?.id).toBe(id);
    expect(selectIsBusy(useQueueStore.getState())).toBe(false);
  });

  it('removes a deleted generation from every list', () => {
    const job = gen({ id: '44444444-4444-4444-4444-444444444444', status: 'COMPLETED', completedAt: '2026-01-01T00:01:00.000Z' });
    useQueueStore.setState({ history: [job], current: job });
    useQueueStore.getState().handleEvent({ type: 'generation.deleted', data: { id: job.id } });
    expect(useQueueStore.getState()).toMatchObject({ history: [], current: null });
  });

  it('ignores unrelated SSE events', () => {
    const before = useQueueStore.getState();
    useQueueStore.getState().handleEvent({ type: 'style.created', data: {} } as SSEEvent);
    expect(useQueueStore.getState().version).toBe(before.version);
  });
});

import type { Generation, GenerationProgress, SSEEvent } from '@map-exporter/contracts';
import { create } from 'zustand';
import { useAuthStore } from '@/modules/auth/auth.store';
import { api } from '@/shared/api/endpoints';

interface QueueState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  current: Generation | null;
  queue: Generation[];
  history: Generation[];
  /** Live progress of the current job (from SSE), keyed by generation id. */
  progress: Record<string, GenerationProgress>;
  /** Bumps whenever queue composition changes (used to refresh ETAs). */
  version: number;
  /** Ids that just completed – used for exit transition in the UI. */
  recentlyCompleted: string[];

  refresh: () => Promise<void>;
  handleEvent: (event: SSEEvent) => void;
}

function sortQueue(queue: Generation[]): Generation[] {
  return [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((g, i) => ({ ...g, queuePosition: i + 1 }));
}

function sortHistory(history: Generation[]): Generation[] {
  return [...history].sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)).slice(0, 100);
}

/**
 * Projection of backend queue state. REST (`refresh`) is authoritative; SSE events
 * apply incremental updates between refreshes.
 */
export const useQueueStore = create<QueueState>((set, get) => ({
  status: 'idle',
  current: null,
  queue: [],
  history: [],
  progress: {},
  version: 0,
  recentlyCompleted: [],

  refresh: async () => {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const res = await api.generations.list();
      set((s) => ({
        status: 'ready',
        current: res.current,
        queue: sortQueue(res.queue),
        history: sortHistory(res.history),
        version: s.version + 1,
        progress: res.current ? pick(s.progress, res.current.id) : {},
      }));
    } catch {
      set({ status: 'error' });
    }
  },

  handleEvent: (event) => {
    const myId = useAuthStore.getState().user?.id ?? null;
    const isMine = (g: { id: string; userId?: string | null }) => {
      const s = get();
      const tracked =
        s.current?.id === g.id || s.queue.some((x) => x.id === g.id) || s.history.some((x) => x.id === g.id);
      // Before auth bootstrap (and in unit tests) keep the previous unscoped behaviour.
      if (!myId) return true;
      if (g.userId) return g.userId === myId || tracked;
      return tracked;
    };

    switch (event.type) {
      case 'generation.created': {
        const g = event.data;
        if (!isMine(g)) break;
        set((s) => {
          // Create HTTP response is applied locally for snappy UI, but SSE may have
          // already started/finished the same job. Never re-queue a known active or
          // terminal generation.
          if (s.current?.id === g.id) return s;
          if (s.history.some((h) => h.id === g.id)) return s;
          if (g.status !== 'QUEUED') return s;
          return {
            queue: sortQueue([...s.queue.filter((x) => x.id !== g.id), g]),
            version: s.version + 1,
          };
        });
        break;
      }
      case 'generation.started': {
        const g = event.data;
        if (!isMine(g)) break;
        set((s) => ({
          current: g,
          queue: sortQueue(s.queue.filter((x) => x.id !== g.id)),
          version: s.version + 1,
        }));
        break;
      }
      case 'generation.progress': {
        const p = event.data;
        set((s) => {
          if (!s.current || s.current.id !== p.id) return s;
          return {
            progress: { ...s.progress, [p.id]: p },
            current: { ...s.current, completedTiles: p.completed, tileCount: p.total || s.current.tileCount },
          };
        });
        break;
      }
      case 'generation.packaging': {
        const g = event.data;
        if (!isMine(g)) break;
        set((s) => ({
          current: s.current && s.current.id === g.id ? { ...s.current, ...g, completedTiles: s.current.completedTiles } : g,
        }));
        break;
      }
      case 'generation.completed':
      case 'generation.failed':
      case 'generation.cancelled': {
        const g = event.data;
        if (!isMine(g)) break;
        set((s) => ({
          current: s.current && s.current.id === g.id ? null : s.current,
          queue: sortQueue(s.queue.filter((x) => x.id !== g.id)),
          history: sortHistory([g, ...s.history.filter((x) => x.id !== g.id)]),
          progress: omit(s.progress, g.id),
          version: s.version + 1,
          recentlyCompleted: event.type === 'generation.completed' ? [...s.recentlyCompleted, g.id] : s.recentlyCompleted,
        }));
        if (event.type === 'generation.completed') {
          globalThis.setTimeout(() => set((s) => ({ recentlyCompleted: s.recentlyCompleted.filter((id) => id !== g.id) })), 2500);
        }
        break;
      }
      case 'generation.deleted': {
        const { id } = event.data;
        set((s) => {
          const known =
            s.current?.id === id || s.queue.some((x) => x.id === id) || s.history.some((x) => x.id === id);
          if (!known) return s;
          return {
            queue: sortQueue(s.queue.filter((x) => x.id !== id)),
            history: s.history.filter((x) => x.id !== id),
            current: s.current?.id === id ? null : s.current,
            version: s.version + 1,
          };
        });
        break;
      }
      case 'queue.changed':
        // Position of our waiting jobs may have changed — refresh user-scoped list.
        void get().refresh();
        break;
      default:
        break;
    }
  },
}));

function pick<T>(obj: Record<string, T>, key: string): Record<string, T> {
  return key in obj ? { [key]: obj[key] as T } : {};
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = obj;
  return rest;
}

export const selectCurrentProgress = (s: QueueState): GenerationProgress | null => (s.current ? (s.progress[s.current.id] ?? null) : null);
export const selectIsBusy = (s: QueueState) => s.current !== null || s.queue.length > 0;

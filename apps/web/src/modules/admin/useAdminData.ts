import type {
  AdminUserRow,
  Generation,
  GenerationProgress,
  InterestSubmission,
  RoleLimits,
} from '@map-exporter/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toastError } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';

const POLL_MS = 30_000;
const EVENT_REFRESH_DEBOUNCE_MS = 600;

export interface AdminData {
  users: AdminUserRow[];
  roleLimits: RoleLimits[];
  current: Generation | null;
  queue: Generation[];
  history: Generation[];
  interest: InterestSubmission[];
  interestTotal: number;
}

const EMPTY: AdminData = {
  users: [],
  roleLimits: [],
  current: null,
  queue: [],
  history: [],
  interest: [],
  interestTotal: 0,
};

/**
 * Everything the admin console shows. REST is the source of truth; the global SSE stream
 * feeds live progress for the running job and triggers a debounced re-fetch on queue changes.
 */
export function useAdminData(enabled: boolean) {
  const [data, setData] = useState<AdminData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const run = (async () => {
      try {
        const [usersRes, queueRes, interestRes] = await Promise.all([
          api.admin.users(),
          api.admin.queue(),
          api.admin.interest(),
        ]);
        setData({
          users: usersRes.users,
          roleLimits: usersRes.roleLimits,
          current: queueRes.current,
          queue: queueRes.queue,
          history: queueRes.history,
          interest: interestRes.submissions,
          interestTotal: interestRes.total,
        });
        setUpdatedAt(Date.now());
        setLoaded(true);
      } catch (e) {
        toastError('Failed to load admin data', e);
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(api.events.url());
    let debounce: number | null = null;
    const scheduleRefresh = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refresh(), EVENT_REFRESH_DEBOUNCE_MS);
    };

    source.addEventListener('connected', () => setLive(true));
    source.onerror = () => setLive(false);
    source.addEventListener('generation.progress', (e) => {
      try {
        setProgress(JSON.parse((e as MessageEvent).data) as GenerationProgress);
      } catch {
        // malformed frame – the next one will do
      }
    });
    for (const type of [
      'generation.created',
      'generation.started',
      'generation.packaging',
      'generation.completed',
      'generation.failed',
      'generation.cancelled',
      'generation.deleted',
    ]) {
      source.addEventListener(type, scheduleRefresh);
    }

    return () => {
      if (debounce) window.clearTimeout(debounce);
      source.close();
      setLive(false);
    };
  }, [enabled, refresh]);

  return { data, setData, loaded, refreshing, updatedAt, live, progress, refresh };
}

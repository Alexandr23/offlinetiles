import { SSE_EVENT_TYPES, type SSEEvent } from '@map-exporter/contracts';
import { useEffect } from 'react';
import { useAuthStore } from '@/modules/auth/auth.store';
import { useStyleStore } from '@/modules/style-editor/style.store';
import { useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { useQueueStore } from './queue.store';

/**
 * Single global SSE connection. On (re)connect the REST state is re-fetched so
 * nothing is missed; afterwards events are applied incrementally.
 * EventSource reconnects automatically; we add a backoff for hard failures.
 */
export function useEventStream(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let attempts = 0;
    let disposed = false;

    const setConnected = useUiStore.getState().setSseConnected;

    const isMyStyle = (style: { id: string; userId?: string | null }) => {
      const myId = useAuthStore.getState().user?.id ?? null;
      if (!myId) return true;
      if (style.userId) return style.userId === myId;
      // Ignore legacy / foreign styles that somehow arrive over the shared bus.
      return useStyleStore.getState().savedStyles.some((s) => s.id === style.id);
    };

    const dispatch = (event: SSEEvent) => {
      useQueueStore.getState().handleEvent(event);
      if (event.type === 'style.created' || event.type === 'style.updated') {
        if (isMyStyle(event.data)) useStyleStore.getState().upsertSaved(event.data);
      }
      if (event.type === 'style.deleted') useStyleStore.getState().removeSaved(event.data.id);
    };

    const connect = () => {
      if (disposed) return;
      source = new EventSource(api.events.url());

      source.addEventListener('connected', () => {
        attempts = 0;
        setConnected(true);
        // REST is authoritative after (re)connect.
        void useQueueStore.getState().refresh();
        void useStyleStore.getState().loadSaved();
      });

      for (const type of SSE_EVENT_TYPES) {
        source.addEventListener(type, (e) => {
          try {
            dispatch({ type, data: JSON.parse((e as MessageEvent).data) } as SSEEvent);
          } catch (err) {
            console.warn('bad SSE payload', type, err);
          }
        });
      }

      source.onerror = () => {
        setConnected(false);
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          source = null;
          attempts += 1;
          const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
          retryTimer = window.setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      source?.close();
      setConnected(false);
    };
  }, [enabled]);
}

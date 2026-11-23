import { useEffect, useRef } from 'react';
import { useDatasetStore } from '@/modules/dataset/dataset.store';
import { useDrawingStore } from '@/modules/drawing/drawing.store';
import { useQueueStore } from '@/modules/queue/queue.store';
import { api } from '@/shared/api/endpoints';
import { useGenerateStore } from './generate.store';

const DEBOUNCE_MS = 450;

/**
 * Keeps the generation estimate fresh: re-requests (debounced) whenever the polygon,
 * zoom range or output type change, and when the queue changes (ETA).
 */
export function useEstimate(): void {
  const selection = useDrawingStore((s) => s.selection);
  const minZoom = useGenerateStore((s) => s.minZoom);
  const maxZoom = useGenerateStore((s) => s.maxZoom);
  const content = useGenerateStore((s) => s.content);
  const tileSize = useGenerateStore((s) => s.tileSize);
  const ready = useDatasetStore((s) => s.info?.ready === true);
  const queueVersion = useQueueStore((s) => s.version);
  const setEstimate = useGenerateStore((s) => s.setEstimate);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    if (!selection || !ready) {
      setEstimate(null, 'idle');
      return;
    }
    setEstimate(useGenerateStore.getState().estimate, 'loading');

    const timer = window.setTimeout(async () => {
      const ac = new AbortController();
      controller.current = ac;
      try {
        const estimate = await api.generations.estimate(
          {
            selection,
            minZoom,
            maxZoom,
            content,
            container: 'mbtiles',
            raster: content === 'raster' ? { format: 'png', tileSize } : undefined,
          },
          ac.signal,
        );
        if (!ac.signal.aborted) setEstimate(estimate, 'ready');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setEstimate(null, 'error', (err as Error).message);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selection, minZoom, maxZoom, content, tileSize, ready, queueVersion, setEstimate]);
}

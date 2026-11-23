import { useCallback } from 'react';
import { useAuthStore } from '@/modules/auth/auth.store';
import { useDrawingStore } from '@/modules/drawing/drawing.store';
import { useQueueStore } from '@/modules/queue/queue.store';
import { selectCurrentStyleId, selectCurrentStyleName, useStyleStore } from '@/modules/style-editor/style.store';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { buildGenerationName, useGenerateStore } from './generate.store';

/** Builds the immutable generation request from the current UI state and submits it. */
export function useSubmitGeneration(): () => Promise<void> {
  return useCallback(async () => {
    const selection = useDrawingStore.getState().selection;
    if (!selection) return;
    const exp = useGenerateStore.getState();
    const styleState = useStyleStore.getState();
    const styleName = selectCurrentStyleName(styleState);
    const styleId = selectCurrentStyleId(styleState);
    const ui = useUiStore.getState();
    const name = buildGenerationName(styleName, exp.minZoom, exp.maxZoom);

    exp.setSubmitting(true);
    try {
      const created = await api.generations.create({
        name,
        selection,
        minZoom: exp.minZoom,
        maxZoom: exp.maxZoom,
        content: exp.content,
        container: 'mbtiles',
        raster: exp.content === 'raster' ? { format: 'png', tileSize: exp.tileSize } : undefined,
        style: {
          styleId,
          styleName,
          styleSnapshot: styleState.workingStyle,
        },
      });
      useQueueStore.getState().handleEvent({ type: 'generation.created', data: created });
      await useAuthStore.getState().refresh();
      ui.pushToast({
        tone: 'success',
        title: created.queuePosition && created.queuePosition > 1 ? `Queued #${created.queuePosition}` : 'Generation queued',
        message: created.name,
      });
    } catch (err) {
      toastError('Could not start generation', err);
      await useAuthStore.getState().refresh();
    } finally {
      useGenerateStore.getState().setSubmitting(false);
    }
  }, []);
}

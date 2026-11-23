import { geometryBounds } from '@map-exporter/contracts';
import { useEffect, useRef } from 'react';
import { useDatasetStore } from '@/modules/dataset/dataset.store';
import { useDrawingStore } from '@/modules/drawing/drawing.store';
import { useGenerateStore } from '@/modules/generate/generate.store';
import { consumeLandingHandoff } from '@/modules/landing/handoff';
import { useMapStore } from '@/modules/map/map.store';
import { useStyleStore } from '@/modules/style-editor/style.store';
import { useUiStore } from '@/modules/ui/ui.store';
import { AppShell } from './layout/AppShell';

const DATASET_POLL_MS = 5000;

/**
 * Full editor route. Loads dataset state and applies any pending landing handoff
 * (selection + preset + content) once on mount.
 */
export function EditorPage() {
  const load = useDatasetStore((s) => s.load);
  const ready = useDatasetStore((s) => s.info?.ready === true);
  const loadSaved = useStyleStore((s) => s.loadSaved);
  const handoffApplied = useRef(false);
  const pendingFit = useRef<ReturnType<typeof geometryBounds> | null>(null);

  useEffect(() => {
    document.body.dataset.scroll = 'locked';
    document.title = 'OfflineTiles Editor';
    return () => {
      delete document.body.dataset.scroll;
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (ready) return;
    const t = window.setInterval(() => void load(), DATASET_POLL_MS);
    return () => window.clearInterval(t);
  }, [ready, load]);

  useEffect(() => {
    if (ready) void loadSaved();
  }, [ready, loadSaved]);

  useEffect(() => {
    if (handoffApplied.current) return;
    handoffApplied.current = true;
    const handoff = consumeLandingHandoff();
    if (!handoff) return;

    useStyleStore.getState().applyPreset(handoff.presetId);
    useGenerateStore.getState().setContent(handoff.content);
    useDrawingStore.getState().loadSelection(handoff.selection);
    useUiStore.getState().setRightTab('generate');
    useUiStore.getState().pushToast({
      tone: 'info',
      title: 'Area loaded',
      message: 'Pick a style or zoom, then generate',
    });
    pendingFit.current = geometryBounds(handoff.selection.geometry);
  }, []);

  useEffect(() => {
    if (!pendingFit.current) return;
    const unsub = useMapStore.subscribe((state) => {
      if (!state.loaded || !state.map || !pendingFit.current) return;
      state.map.fitBounds(pendingFit.current, { padding: 80, duration: 700 });
      pendingFit.current = null;
    });
    const { map, loaded } = useMapStore.getState();
    if (loaded && map && pendingFit.current) {
      map.fitBounds(pendingFit.current, { padding: 80, duration: 700 });
      pendingFit.current = null;
    }
    return unsub;
  }, []);

  return <AppShell />;
}

import type { MapLibreStyle, MapStyle, PresetId, StyleRef } from '@map-exporter/contracts';
import { create } from 'zustand';
import { api } from '@/shared/api/endpoints';
import { clonePresetStyle, getPreset } from './presets';
import { applyStyleParam, readStyleParams, stylesEqual, type StyleParamPatch, type StyleParams } from './style-model';

interface StyleState {
  /** What the working copy was derived from. */
  source: StyleRef;
  /** Pristine copy of the source for dirty detection / reset. */
  baseStyle: MapLibreStyle;
  /** The style currently shown on the map and used for exports. */
  workingStyle: MapLibreStyle;
  params: StyleParams;

  /** Projection of backend saved styles (REST + SSE keep it in sync). */
  savedStyles: MapStyle[];
  savedStatus: 'idle' | 'loading' | 'loaded' | 'error';
  saving: boolean;

  applyPreset: (id: PresetId) => void;
  applySaved: (id: string) => void;
  updateParam: (patch: StyleParamPatch) => void;
  replaceWorkingStyle: (style: MapLibreStyle) => void;
  resetWorking: () => void;

  loadSaved: () => Promise<void>;
  saveAsNew: (name: string) => Promise<MapStyle>;
  saveCurrent: () => Promise<MapStyle | null>;
  rename: (id: string, name: string) => Promise<void>;
  duplicate: (id: string) => Promise<MapStyle>;
  remove: (id: string) => Promise<void>;

  upsertSaved: (style: MapStyle) => void;
  removeSaved: (id: string) => void;
}

const initialPreset: PresetId = 'light';
const initialStyle = clonePresetStyle(initialPreset);

export const useStyleStore = create<StyleState>((set, get) => ({
  source: { kind: 'preset', presetId: initialPreset },
  baseStyle: initialStyle,
  workingStyle: initialStyle,
  params: readStyleParams(initialStyle),
  savedStyles: [],
  savedStatus: 'idle',
  saving: false,

  applyPreset: (id) => {
    const style = clonePresetStyle(id);
    set({ source: { kind: 'preset', presetId: id }, baseStyle: style, workingStyle: style, params: readStyleParams(style) });
  },

  applySaved: (id) => {
    const saved = get().savedStyles.find((s) => s.id === id);
    if (!saved) return;
    const style = structuredClone(saved.style);
    set({ source: { kind: 'saved', styleId: id }, baseStyle: style, workingStyle: style, params: readStyleParams(style) });
  },

  updateParam: (patch) => {
    const next = applyStyleParam(get().workingStyle, patch);
    set({ workingStyle: next, params: readStyleParams(next) });
  },

  replaceWorkingStyle: (style) => set({ workingStyle: style, params: readStyleParams(style) }),

  resetWorking: () => {
    const base = structuredClone(get().baseStyle);
    set({ workingStyle: base, params: readStyleParams(base) });
  },

  loadSaved: async () => {
    set({ savedStatus: 'loading' });
    try {
      const savedStyles = await api.styles.list();
      const { source } = get();
      // Drop a saved selection that belongs to another account after identity change.
      if (source.kind === 'saved' && !savedStyles.some((s) => s.id === source.styleId)) {
        const presetId =
          (get().workingStyle.metadata?.['map-exporter'] as { preset?: PresetId } | undefined)?.preset ?? 'light';
        set({
          savedStyles,
          savedStatus: 'loaded',
          source: { kind: 'preset', presetId },
          baseStyle: clonePresetStyle(presetId),
        });
        return;
      }
      set({ savedStyles, savedStatus: 'loaded' });
    } catch {
      set({ savedStatus: 'error' });
    }
  },

  saveAsNew: async (name) => {
    set({ saving: true });
    try {
      const { workingStyle, source } = get();
      const sourceStyleId = source.kind === 'saved' ? source.styleId : null;
      const basePreset =
        source.kind === 'preset' ? source.presetId : (get().savedStyles.find((s) => s.id === sourceStyleId)?.basePreset ?? null);
      const created = await api.styles.create({ name, basePreset, style: { ...workingStyle, name } });
      get().upsertSaved(created);
      const style = structuredClone(created.style);
      set({ source: { kind: 'saved', styleId: created.id }, baseStyle: style, workingStyle: style, params: readStyleParams(style) });
      return created;
    } finally {
      set({ saving: false });
    }
  },

  saveCurrent: async () => {
    const { source, workingStyle } = get();
    if (source.kind !== 'saved') return null;
    set({ saving: true });
    try {
      const updated = await api.styles.update(source.styleId, { style: workingStyle });
      get().upsertSaved(updated);
      const style = structuredClone(updated.style);
      set({ baseStyle: style, workingStyle: style, params: readStyleParams(style) });
      return updated;
    } finally {
      set({ saving: false });
    }
  },

  rename: async (id, name) => {
    const updated = await api.styles.update(id, { name });
    get().upsertSaved(updated);
    const { source } = get();
    if (source.kind === 'saved' && source.styleId === id) {
      set((s) => ({
        baseStyle: { ...s.baseStyle, name },
        workingStyle: { ...s.workingStyle, name },
      }));
    }
  },

  duplicate: async (id) => {
    const created = await api.styles.duplicate(id);
    get().upsertSaved(created);
    return created;
  },

  remove: async (id) => {
    await api.styles.delete(id);
    get().removeSaved(id);
  },

  upsertSaved: (style) =>
    set((s) => {
      const exists = s.savedStyles.some((x) => x.id === style.id);
      const savedStyles = exists ? s.savedStyles.map((x) => (x.id === style.id ? style : x)) : [style, ...s.savedStyles];
      savedStyles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { savedStyles };
    }),

  removeSaved: (id) =>
    set((s) => {
      const savedStyles = s.savedStyles.filter((x) => x.id !== id);
      if (s.source.kind === 'saved' && s.source.styleId === id) {
        // Keep the working copy but detach it from the deleted record.
        const presetId = (s.workingStyle.metadata?.['map-exporter'] as { preset?: PresetId } | undefined)?.preset ?? 'light';
        return { savedStyles, source: { kind: 'preset', presetId }, baseStyle: clonePresetStyle(presetId) };
      }
      return { savedStyles };
    }),
}));

export const selectIsDirty = (s: StyleState) => !stylesEqual(s.baseStyle, s.workingStyle);

export const selectCurrentStyleName = (s: StyleState): string => {
  const source = s.source;
  if (source.kind === 'preset') return getPreset(source.presetId).name;
  return s.savedStyles.find((x) => x.id === source.styleId)?.name ?? s.workingStyle.name ?? 'Custom';
};

export const selectCurrentStyleId = (s: StyleState): string | null => (s.source.kind === 'saved' ? s.source.styleId : null);

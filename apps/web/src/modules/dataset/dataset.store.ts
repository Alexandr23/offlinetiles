import type { DatasetInfo } from '@map-exporter/contracts';
import { create } from 'zustand';
import { api } from '@/shared/api/endpoints';

interface DatasetState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  info: DatasetInfo | null;
  error: string | null;
  load: () => Promise<void>;
}

/** Projection of backend dataset state (REST is authoritative). */
export const useDatasetStore = create<DatasetState>((set) => ({
  status: 'idle',
  info: null,
  error: null,
  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const info = await api.dataset.get();
      set({ status: 'loaded', info });
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },
}));

export const selectDatasetReady = (s: DatasetState) => s.info?.ready === true;
export const selectDatasetMaxZoom = (s: DatasetState) => (s.info?.ready ? s.info.maxZoom : 14);

import type maplibregl from 'maplibre-gl';
import { create } from 'zustand';

export interface Viewport {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

interface MapState {
  /** The live MapLibre instance. Not serializable; only for imperative access from hooks. */
  map: maplibregl.Map | null;
  loaded: boolean;
  viewport: Viewport;
  cursor: [number, number] | null;
  setMap: (map: maplibregl.Map | null) => void;
  setLoaded: (loaded: boolean) => void;
  setViewport: (viewport: Viewport) => void;
  setCursor: (cursor: [number, number] | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  loaded: false,
  viewport: { center: [7.42, 43.73], zoom: 11, bearing: 0, pitch: 0 },
  cursor: null,
  setMap: (map) => set({ map, loaded: false }),
  setLoaded: (loaded) => set({ loaded }),
  setViewport: (viewport) => set({ viewport }),
  setCursor: (cursor) => set({ cursor }),
}));

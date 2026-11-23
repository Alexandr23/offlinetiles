import type { ExportContainer, Generation, GenerationEstimate, RasterTileSize, TileContent } from '@map-exporter/contracts';
import { create } from 'zustand';
import { formatZoomRange } from '@/shared/utils/format';

/** Auto name shown in queue/history — style + zoom. Kept even though the form field is hidden. */
export function buildGenerationName(styleName: string, minZoom: number, maxZoom: number): string {
  const style = styleName.trim() || 'Map';
  return `${style} ${formatZoomRange(minZoom, maxZoom)}`;
}

interface GenerateState {
  name: string;
  nameTouched: boolean;
  content: TileContent;
  container: ExportContainer;
  minZoom: number;
  maxZoom: number;
  tileSize: RasterTileSize;

  estimate: GenerationEstimate | null;
  estimateStatus: 'idle' | 'loading' | 'ready' | 'error';
  estimateError: string | null;
  submitting: boolean;

  setName: (name: string, touched?: boolean) => void;
  setContent: (content: TileContent) => void;
  setZoomRange: (min: number, max: number) => void;
  setTileSize: (size: RasterTileSize) => void;
  setEstimate: (estimate: GenerationEstimate | null, status: GenerateState['estimateStatus'], error?: string | null) => void;
  setSubmitting: (submitting: boolean) => void;
  /** Populates form fields from an existing job (Duplicate). */
  populateFrom: (generation: Generation) => void;
}

export const useGenerateStore = create<GenerateState>((set) => ({
  name: '',
  nameTouched: false,
  content: 'vector',
  container: 'mbtiles',
  minZoom: 8,
  maxZoom: 14,
  tileSize: 256,

  estimate: null,
  estimateStatus: 'idle',
  estimateError: null,
  submitting: false,

  setName: (name, touched = true) => set({ name, nameTouched: touched }),
  setContent: (content) => set({ content }),
  setZoomRange: (minZoom, maxZoom) => set({ minZoom: Math.min(minZoom, maxZoom), maxZoom: Math.max(minZoom, maxZoom) }),
  setTileSize: (tileSize) => set({ tileSize }),
  setEstimate: (estimate, estimateStatus, estimateError = null) => set({ estimate, estimateStatus, estimateError }),
  setSubmitting: (submitting) => set({ submitting }),
  populateFrom: (g) =>
    set({
      name: g.name,
      nameTouched: false,
      content: g.content,
      container: g.container,
      minZoom: g.minZoom,
      maxZoom: g.maxZoom,
      tileSize: (g.raster?.tileSize as RasterTileSize | undefined) ?? 256,
    }),
}));

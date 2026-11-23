import { geometryAreaKm2, geometryBounds, type AreaSelection, type BBox } from '@map-exporter/contracts';
import { create } from 'zustand';

export type DrawTool = 'none' | 'rectangle' | 'polygon';
export type SelectionShape = 'rectangle' | 'polygon';

interface DrawingState {
  tool: DrawTool;
  selection: AreaSelection | null;
  /** How the current selection was drawn (rectangles are still Polygon geometry). */
  selectionShape: SelectionShape | null;
  /** Optional human label (e.g. country name) shown in the area step. */
  selectionLabel: string | null;
  /** Terra Draw feature id backing the current selection (primary / first part). */
  featureId: string | number | null;
  /** Incremented to ask the Terra Draw bridge to remove all features. */
  clearNonce: number;
  /** Incremented to ask the bridge to load `selection` into Terra Draw (duplicate flow). */
  loadNonce: number;

  setTool: (tool: DrawTool) => void;
  setSelection: (
    selection: AreaSelection | null,
    featureId: string | number | null,
    shape?: SelectionShape | null,
  ) => void;
  /** Replaces the selection from outside the map (e.g. country pick or duplicating a job). */
  loadSelection: (selection: AreaSelection, shape?: SelectionShape, label?: string | null) => void;
  clear: () => void;
}

export const useDrawingStore = create<DrawingState>((set) => ({
  tool: 'none',
  selection: null,
  selectionShape: null,
  selectionLabel: null,
  featureId: null,
  clearNonce: 0,
  loadNonce: 0,

  setTool: (tool) =>
    set((s) => ({
      tool,
      // Starting a fresh draw drops the country/label association.
      selectionLabel: tool !== 'none' ? null : s.selectionLabel,
    })),
  setSelection: (selection, featureId, shape) =>
    set((s) => ({
      selection,
      featureId,
      tool: 'none',
      selectionShape: selection ? (shape ?? s.selectionShape ?? 'polygon') : null,
      selectionLabel: selection ? s.selectionLabel : null,
    })),
  loadSelection: (selection, shape = 'polygon', label = null) =>
    set((s) => ({
      selection,
      selectionShape: shape,
      selectionLabel: label,
      featureId: null,
      tool: 'none',
      loadNonce: s.loadNonce + 1,
    })),
  clear: () =>
    set((s) => ({
      selection: null,
      selectionShape: null,
      selectionLabel: null,
      featureId: null,
      tool: 'none',
      clearNonce: s.clearNonce + 1,
    })),
}));

export const selectHasSelection = (s: DrawingState) => s.selection !== null;

export function selectionBounds(selection: AreaSelection | null): BBox | null {
  return selection ? geometryBounds(selection.geometry) : null;
}

export function selectionAreaKm2(selection: AreaSelection | null): number | null {
  return selection ? geometryAreaKm2(selection.geometry) : null;
}

export function selectionVertexCount(selection: AreaSelection | null): number {
  if (!selection) return 0;
  const g = selection.geometry;
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(1);
  return rings.reduce((n, ring) => n + Math.max(0, ring.length - 1), 0);
}

import type { AreaSelection } from '@map-exporter/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { selectHasSelection, selectionAreaKm2, selectionBounds, selectionVertexCount, useDrawingStore } from './drawing.store';

const monaco: AreaSelection = {
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [7.4, 43.72],
        [7.44, 43.72],
        [7.44, 43.75],
        [7.4, 43.75],
        [7.4, 43.72],
      ],
    ],
  },
};

describe('drawing store', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      tool: 'none',
      selection: null,
      selectionShape: null,
      selectionLabel: null,
      featureId: null,
      clearNonce: 0,
      loadNonce: 0,
    });
  });

  it('setSelection stores the feature, shape, and drops back to the pan tool', () => {
    const s = useDrawingStore.getState();
    s.setTool('rectangle');
    expect(useDrawingStore.getState().tool).toBe('rectangle');
    s.setSelection(monaco, 'feature-1', 'rectangle');
    const next = useDrawingStore.getState();
    expect(next.tool).toBe('none');
    expect(next.featureId).toBe('feature-1');
    expect(next.selectionShape).toBe('rectangle');
    expect(selectHasSelection(next)).toBe(true);
  });

  it('clear and loadSelection bump their nonces so the Terra Draw bridge reacts', () => {
    const s = useDrawingStore.getState();
    s.setSelection(monaco, 1, 'rectangle');
    s.clear();
    expect(useDrawingStore.getState()).toMatchObject({
      selection: null,
      selectionShape: null,
      selectionLabel: null,
      featureId: null,
      clearNonce: 1,
      loadNonce: 0,
    });
    s.loadSelection(monaco);
    expect(useDrawingStore.getState()).toMatchObject({
      selection: monaco,
      selectionShape: 'polygon',
      selectionLabel: null,
      featureId: null,
      clearNonce: 1,
      loadNonce: 1,
    });
  });

  it('loadSelection stores a country label and keeps it across edits', () => {
    const s = useDrawingStore.getState();
    s.loadSelection(monaco, 'polygon', 'Monaco');
    expect(useDrawingStore.getState().selectionLabel).toBe('Monaco');
    s.setSelection(monaco, 'f1', 'polygon');
    expect(useDrawingStore.getState().selectionLabel).toBe('Monaco');
    s.setTool('polygon');
    expect(useDrawingStore.getState().selectionLabel).toBeNull();
  });

  it('derives bounds, area and vertex count from the selection', () => {
    expect(selectionBounds(null)).toBeNull();
    expect(selectionAreaKm2(null)).toBeNull();
    expect(selectionVertexCount(null)).toBe(0);

    expect(selectionBounds(monaco)).toEqual([7.4, 43.72, 7.44, 43.75]);
    // ~3.2 km × ~3.3 km
    const area = selectionAreaKm2(monaco)!;
    expect(area).toBeGreaterThan(9);
    expect(area).toBeLessThan(12);
    expect(selectionVertexCount(monaco)).toBe(4);
  });
});

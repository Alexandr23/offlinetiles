import type { Polygon, SelectionGeometry } from '@map-exporter/contracts';
import { useEffect, useRef } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { useMapStore } from '@/modules/map/map.store';
import { tokens } from '@/shared/styles/tokens';
import { useDrawingStore, type DrawTool, type SelectionShape } from './drawing.store';
import { geometryVertexCount, MIDPOINT_VERTEX_LIMIT, polygonPartsForDraw } from './geometry-simplify';
import { clearSelectionVerticesOverlay, syncSelectionVerticesOverlay } from './selection-vertices';

const ACCENT = tokens.color.accent;
const WHITE = '#e8eef5';

/** Vertex / guidance point styling — high contrast so points stay visible on any basemap. */
const POINT = {
  fill: WHITE,
  outline: ACCENT,
  width: 7,
  outlineWidth: 2,
} as const;

const MID_POINT = {
  fill: ACCENT,
  outline: WHITE,
  width: 5,
  outlineWidth: 2,
} as const;

function featureStyles() {
  return {
    fillColor: ACCENT,
    fillOpacity: 0.12,
    outlineColor: ACCENT,
    outlineWidth: 2,
  } as const;
}

function pointStyles(prefix: 'closingPoint' | 'coordinatePoint' | 'editedPoint' | 'snappingPoint') {
  return {
    [`${prefix}Color`]: POINT.fill,
    [`${prefix}Width`]: POINT.width,
    [`${prefix}OutlineColor`]: POINT.outline,
    [`${prefix}OutlineWidth`]: POINT.outlineWidth,
  } as const;
}

/**
 * Bridges Terra Draw with the drawing store:
 *  - store.tool → Terra Draw mode
 *  - Terra Draw finish/change → store.selection (GeoJSON)
 *  - store.clear / loadSelection → Terra Draw features
 *  - selection vertices → MapLibre circle overlay (every ring point)
 * Only one logical selection exists at a time (MultiPolygon may be multiple features).
 */
export function useTerraDraw(): void {
  const map = useMapStore((s) => s.map);
  const loaded = useMapStore((s) => s.loaded);
  const drawRef = useRef<TerraDraw | null>(null);

  useEffect(() => {
    if (!map || !loaded) return;

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 6 }),
      modes: [
        new TerraDrawRectangleMode({ styles: { ...featureStyles() } }),
        new TerraDrawPolygonMode({
          // Show every vertex while drawing — closing point alone was easy to miss.
          showCoordinatePoints: true,
          pointerDistance: 28,
          styles: {
            ...featureStyles(),
            ...pointStyles('closingPoint'),
            ...pointStyles('coordinatePoint'),
            ...pointStyles('editedPoint'),
            ...pointStyles('snappingPoint'),
          },
        }),
        new TerraDrawSelectMode({
          // Throttle drag→store updates so dense rings stay responsive.
          dragEventThrottle: 32,
          pointerDistance: 28,
          flags: {
            polygon: {
              feature: {
                draggable: true,
                coordinates: { midpoints: true, draggable: true, deletable: true },
              },
            },
            rectangle: { feature: { draggable: true, coordinates: { resizable: 'opposite' } } },
          },
          styles: {
            selectedPolygonColor: ACCENT,
            selectedPolygonFillOpacity: 0.16,
            selectedPolygonOutlineColor: tokens.color.accentStrong,
            selectedPolygonOutlineWidth: 2,
            selectionPointColor: POINT.fill,
            selectionPointWidth: POINT.width,
            selectionPointOutlineColor: POINT.outline,
            selectionPointOutlineWidth: POINT.outlineWidth,
            midPointColor: MID_POINT.fill,
            midPointWidth: MID_POINT.width,
            midPointOutlineColor: MID_POINT.outline,
            midPointOutlineWidth: MID_POINT.outlineWidth,
          },
        }),
      ],
    });

    draw.start();
    draw.setMode('select');
    drawRef.current = draw;

    const store = useDrawingStore;

    const syncVertexOverlay = (geometry: SelectionGeometry | null) => {
      try {
        syncSelectionVerticesOverlay(map, geometry);
      } catch {
        // style swap may briefly detach sources
      }
    };

    const shapeFromFeature = (feature: { properties?: Record<string, unknown> | null }): SelectionShape | null => {
      const mode = feature.properties?.mode;
      if (mode === 'rectangle' || mode === 'polygon') return mode;
      return null;
    };

    const selectionPolygons = () =>
      draw.getSnapshot().filter((f) => f.geometry.type === 'Polygon' && (f.properties?.mode === 'polygon' || f.properties?.mode === 'rectangle'));

    const applySelectFlags = (vertexCount: number) => {
      // Dense country rings: keep every vertex visible via the overlay, skip midpoints.
      const midpoints = vertexCount <= MIDPOINT_VERTEX_LIMIT;
      const pointWidth = vertexCount > MIDPOINT_VERTEX_LIMIT ? 4 : POINT.width;
      draw.updateModeOptions('select', {
        flags: {
          polygon: {
            feature: {
              draggable: true,
              coordinates: { midpoints, draggable: true, deletable: true },
            },
          },
          rectangle: { feature: { draggable: true, coordinates: { resizable: 'opposite' } } },
        },
        styles: {
          selectionPointWidth: pointWidth,
          selectionPointOutlineWidth: 2,
          midPointWidth: midpoints ? MID_POINT.width : 0,
        },
      });
    };

    const syncFromDraw = (primaryId?: string | number) => {
      const polys = selectionPolygons();
      if (polys.length === 0) {
        if (store.getState().selection) store.getState().setSelection(null, null);
        syncVertexOverlay(null);
        return;
      }

      const primary = (primaryId !== undefined ? polys.find((f) => f.id === primaryId) : null) ?? polys[0]!;
      const shape = polys.length === 1 ? shapeFromFeature(primary) : 'polygon';
      const geometry: SelectionGeometry =
        polys.length === 1
          ? (primary.geometry as SelectionGeometry)
          : {
              type: 'MultiPolygon',
              coordinates: polys.map((f) => (f.geometry as Polygon).coordinates),
            };

      applySelectFlags(geometryVertexCount(geometry));
      store.getState().setSelection({ geometry }, primary.id ?? null, shape);
      syncVertexOverlay(geometry);
    };

    // Ignore Terra Draw change events caused by programmatic add/clear.
    let suppressSync = false;

    const loadGeometryIntoDraw = (geometry: SelectionGeometry, shape: SelectionShape = 'polygon') => {
      suppressSync = true;
      draw.clear();
      // Exterior rings only — Terra Draw cannot ingest holes (UAE mainland, Lesotho hole in ZA, …).
      const polygons = polygonPartsForDraw(geometry);
      const vertexCount = geometryVertexCount(geometry);
      applySelectFlags(vertexCount);

      const result = draw.addFeatures(
        polygons.map((p) => ({
          type: 'Feature' as const,
          geometry: p,
          properties: { mode: shape === 'rectangle' && polygons.length === 1 ? 'rectangle' : 'polygon' },
        })),
      );
      const invalid = result.filter((r) => !r.valid);
      if (invalid.length > 0) {
        console.warn('[drawing] some country parts failed to load into Terra Draw', invalid);
      }
      const validIds = result.filter((r) => r.valid && r.id !== undefined).map((r) => r.id!);
      const first = validIds[0];
      // Overlay uses the full store geometry (including holes) so every vertex stays visible.
      syncVertexOverlay(geometry);
      if (first !== undefined) {
        store.setState({ featureId: first });
        draw.setMode('select');
        try {
          draw.selectFeature(first);
        } catch {
          // select is best-effort after programmatic add
        }
      }
      queueMicrotask(() => {
        suppressSync = false;
      });
    };

    // Seed from store when draw mounts after a handoff / duplicate while map was loading.
    const existing = store.getState().selection;
    if (existing) {
      loadGeometryIntoDraw(existing.geometry, store.getState().selectionShape ?? 'polygon');
    } else {
      syncVertexOverlay(null);
    }

    // Throttle change→store sync during continuous updates (vertex drag).
    let syncRaf: number | null = null;
    let pendingPrimary: string | number | undefined;
    const scheduleSync = (id?: string | number) => {
      if (suppressSync) return;
      if (id !== undefined) pendingPrimary = id;
      if (syncRaf !== null) return;
      syncRaf = requestAnimationFrame(() => {
        syncRaf = null;
        if (suppressSync) return;
        const primary = pendingPrimary;
        pendingPrimary = undefined;
        syncFromDraw(primary);
      });
    };

    draw.on('finish', (id, context) => {
      if (context.action === 'draw') {
        // Keep only the newest drawn feature for freehand tools.
        for (const f of selectionPolygons()) {
          if (f.id !== id && f.id !== undefined) draw.removeFeatures([f.id]);
        }
        syncFromDraw(id);
        draw.setMode('select');
        draw.selectFeature(id);
      } else {
        scheduleSync(id);
      }
    });

    draw.on('change', (ids, type) => {
      // draw.clear() during loadSelection/setTool emits delete — must not wipe store selection.
      if (suppressSync) return;
      if (type === 'delete') {
        const remaining = selectionPolygons();
        if (remaining.length === 0 && store.getState().selection) {
          store.getState().setSelection(null, null);
          syncVertexOverlay(null);
        } else if (remaining.length > 0) {
          scheduleSync(remaining[0]!.id);
        }
      } else if (type === 'update') {
        const current = store.getState().featureId;
        const hit = current !== null && ids.includes(current) ? current : ids[0];
        if (hit !== undefined) scheduleSync(hit);
      }
    });

    let lastClear = store.getState().clearNonce;
    let lastLoad = store.getState().loadNonce;
    let lastTool: DrawTool = store.getState().tool;

    const unsubscribe = store.subscribe((state) => {
      if (state.tool !== lastTool) {
        lastTool = state.tool;
        if (state.tool === 'rectangle' || state.tool === 'polygon') {
          draw.clear();
          syncVertexOverlay(null);
          draw.setMode(state.tool);
        } else {
          draw.setMode('select');
        }
      }
      if (state.clearNonce !== lastClear) {
        lastClear = state.clearNonce;
        draw.clear();
        syncVertexOverlay(null);
        draw.setMode('select');
      }
      if (state.loadNonce !== lastLoad && state.selection) {
        lastLoad = state.loadNonce;
        loadGeometryIntoDraw(state.selection.geometry, state.selectionShape ?? 'polygon');
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = store.getState();
        if (s.tool !== 'none') s.setTool('none');
        else if (s.featureId !== null) draw.deselectFeature(s.featureId);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      unsubscribe();
      if (syncRaf !== null) cancelAnimationFrame(syncRaf);
      try {
        clearSelectionVerticesOverlay(map);
      } catch {
        // map may already be removed
      }
      try {
        draw.stop();
      } catch {
        // map may already be removed
      }
      drawRef.current = null;
    };
  }, [map, loaded]);
}

import type { Polygon, SelectionGeometry } from '@map-exporter/contracts';
import { useEffect, useRef } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { useMapStore } from '@/modules/map/map.store';
import { tokens } from '@/shared/styles/tokens';
import { useDrawingStore, type DrawTool, type SelectionShape } from './drawing.store';
import { geometryVertexCount, MIDPOINT_VERTEX_LIMIT, polygonPartsForDraw } from './geometry-simplify';
import {
  clearCountryOverlay,
  COUNTRY_STRIPES_IMAGE,
  ensureCountryStripesImage,
  syncCountryOverlay,
} from './country-overlay';
import { createDragPreview } from './drag-preview';
import {
  clearSelectionVerticesOverlay,
  SELECTION_VERTICES_LAYER,
  syncSelectionVerticesOverlay,
} from './selection-vertices';

const SELECTION = tokens.color.selection;
const WHITE = '#e8eef5';

/** Vertex / guidance point styling — high contrast so points stay visible on any basemap. */
const POINT = {
  fill: WHITE,
  outline: SELECTION,
  width: 4,
  outlineWidth: 1.5,
} as const;

const MID_POINT = {
  fill: SELECTION,
  outline: WHITE,
  width: 3,
  outlineWidth: 1,
} as const;

function featureStyles() {
  return {
    fillColor: SELECTION,
    fillOpacity: 0.12,
    outlineColor: SELECTION,
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
        // Accept both click–move–click and press–drag–release.
        new TerraDrawRectangleMode({ drawInteraction: 'click-move-or-drag', styles: { ...featureStyles() } }),
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
            selectedPolygonColor: SELECTION,
            selectedPolygonFillOpacity: 0.16,
            selectedPolygonOutlineColor: tokens.color.selectionStrong,
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

    let appliedFlagsKey = '';
    let midpointsEnabled = true;
    let selectionPointWidth: number = POINT.width;
    const applySelectFlags = (vertexCount: number) => {
      // Dense rings: keep every vertex visible via the overlay, skip midpoints.
      const midpoints = vertexCount <= MIDPOINT_VERTEX_LIMIT;
      const pointWidth = vertexCount > MIDPOINT_VERTEX_LIMIT ? 2.5 : POINT.width;
      midpointsEnabled = midpoints;
      selectionPointWidth = pointWidth;
      // updateModeOptions resets Terra Draw's select-mode state (including an in-progress drag),
      // and this runs on every change event — only call it when something actually changed.
      const key = `${midpoints}|${pointWidth}`;
      if (key === appliedFlagsKey) return;
      appliedFlagsKey = key;
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
          selectionPointOutlineWidth: POINT.outlineWidth,
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

    /**
     * Clears Terra Draw without the `delete` change event reaching the store: otherwise it is
     * treated as a user deletion and `setSelection(null)` resets `tool` to 'none', cancelling the
     * rectangle/polygon tool that was just activated.
     */
    const clearDrawSilently = () => {
      const prev = suppressSync;
      suppressSync = true;
      try {
        draw.clear();
      } finally {
        suppressSync = prev;
      }
    };

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
        console.warn('[drawing] some selection parts failed to load into Terra Draw', invalid);
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

    const syncCountry = (geometry: SelectionGeometry | null) => {
      try {
        syncCountryOverlay(map, geometry);
      } catch {
        // style swap may briefly detach sources
      }
    };

    // A full (non-diff) style reload drops images added at runtime.
    const onImageMissing = (e: { id: string }) => {
      if (e.id === COUNTRY_STRIPES_IMAGE) ensureCountryStripesImage(map);
    };
    map.on('styleimagemissing', onImageMissing);

    /** Countries render as a read-only overlay; drawn shapes go into Terra Draw for editing. */
    const showSelection = (geometry: SelectionGeometry, shape: SelectionShape) => {
      if (shape === 'country') {
        clearDrawSilently();
        draw.setMode('select');
        syncVertexOverlay(null);
        syncCountry(geometry);
        store.setState({ featureId: null });
      } else {
        syncCountry(null);
        loadGeometryIntoDraw(geometry, shape);
      }
    };

    // Seed from store when draw mounts after a handoff / duplicate while map was loading.
    const existing = store.getState().selection;
    if (existing) {
      showSelection(existing.geometry, store.getState().selectionShape ?? 'polygon');
    } else {
      syncVertexOverlay(null);
    }

    // Throttle change→store sync during continuous updates (vertex drag).
    let syncRaf: number | null = null;
    let pendingPrimary: string | number | undefined;
    /**
     * While a draw tool is active Terra Draw emits `create`/`update`/`delete` for the shape being
     * drawn. Those are not selections: syncing them would call `setSelection`, which resets the
     * tool to 'none' and cancels the drawing. The `finish` event is the only source of truth then.
     */
    const isDrawing = () => {
      const mode = draw.getMode();
      return mode === 'rectangle' || mode === 'polygon';
    };

    const dragPreview = createDragPreview(map, ['td-polygon', 'td-polygon-outline', 'td-point', SELECTION_VERTICES_LAYER], {
      fill: SELECTION,
      fillOpacity: 0.16,
      outline: tokens.color.selectionStrong,
      outlineWidth: 2,
      point: { fill: POINT.fill, outline: POINT.outline, outlineWidth: POINT.outlineWidth },
      midPoint: MID_POINT,
    });

    // A select-mode update while the primary button is held is a drag (feature, vertex or resize).
    let pointerDown = false;
    let dragging = false;
    let previewRaf: number | null = null;

    const renderDragPreview = () => {
      dragPreview.render(
        selectionPolygons().map((f) => ({
          rings: (f.geometry as Polygon).coordinates,
          selected: f.properties?.selected === true,
          midpoints: midpointsEnabled && f.properties?.mode === 'polygon',
        })),
        selectionPointWidth,
      );
    };

    const scheduleDragPreview = () => {
      if (previewRaf !== null) return;
      previewRaf = requestAnimationFrame(() => {
        previewRaf = null;
        if (dragging) renderDragPreview();
      });
    };

    const cancelDragPreview = () => {
      if (previewRaf !== null) cancelAnimationFrame(previewRaf);
      previewRaf = null;
    };

    const endDrag = (primaryId?: string | number) => {
      if (!dragging) return;
      dragging = false;
      cancelDragPreview();
      renderDragPreview();
      syncFromDraw(primaryId);
      dragPreview.finish();
    };

    const resetDrag = () => {
      dragging = false;
      cancelDragPreview();
      dragPreview.reset();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) pointerDown = true;
    };
    const onPointerUp = () => {
      pointerDown = false;
      // Terra Draw emits `finish` for drags; this only covers a release it never saw.
      if (dragging) requestAnimationFrame(() => endDrag());
    };
    const canvas = map.getCanvas();
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp, true);

    const scheduleSync = (id?: string | number) => {
      if (suppressSync || isDrawing() || dragging) return;
      if (id !== undefined) pendingPrimary = id;
      if (syncRaf !== null) return;
      syncRaf = requestAnimationFrame(() => {
        syncRaf = null;
        if (suppressSync || isDrawing()) return;
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
      } else if (dragging) {
        endDrag(id);
      } else {
        scheduleSync(id);
      }
    });

    draw.on('change', (ids, type) => {
      // draw.clear() during loadSelection/setTool emits delete — must not wipe store selection.
      if (suppressSync || isDrawing()) return;
      if (type === 'delete') {
        const remaining = selectionPolygons();
        if (remaining.length === 0 && store.getState().selection) {
          store.getState().setSelection(null, null);
          syncVertexOverlay(null);
        } else if (remaining.length > 0) {
          scheduleSync(remaining[0]!.id);
        }
      } else if (type === 'update') {
        if (pointerDown && draw.getMode() === 'select') {
          dragging = true;
          scheduleDragPreview();
          return;
        }
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
          resetDrag();
          clearDrawSilently();
          syncVertexOverlay(null);
          syncCountry(null);
          draw.setMode(state.tool);
          // Starting a fresh draw drops the previous selection (the store keeps it until finish).
          if (state.selection) useDrawingStore.setState({ selection: null, selectionShape: null, featureId: null });
        } else {
          draw.setMode('select');
        }
      }
      if (state.clearNonce !== lastClear) {
        lastClear = state.clearNonce;
        resetDrag();
        clearDrawSilently();
        syncVertexOverlay(null);
        syncCountry(null);
        draw.setMode('select');
      }
      if (state.loadNonce !== lastLoad && state.selection) {
        lastLoad = state.loadNonce;
        resetDrag();
        showSelection(state.selection.geometry, state.selectionShape ?? 'polygon');
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
      window.removeEventListener('pointerup', onPointerUp, true);
      canvas.removeEventListener('pointerdown', onPointerDown);
      map.off('styleimagemissing', onImageMissing);
      unsubscribe();
      if (syncRaf !== null) cancelAnimationFrame(syncRaf);
      try {
        resetDrag();
        clearSelectionVerticesOverlay(map);
        clearCountryOverlay(map);
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

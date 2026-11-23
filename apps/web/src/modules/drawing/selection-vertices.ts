import type { SelectionGeometry } from '@map-exporter/contracts';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import { tokens } from '@/shared/styles/tokens';

export const SELECTION_VERTICES_SOURCE = 'me-selection-vertices';
export const SELECTION_VERTICES_LAYER = 'me-selection-vertices-circle';

/** Build a point FeatureCollection from every ring vertex (excluding closing duplicates). */
export function selectionVerticesCollection(geometry: SelectionGeometry | null): FeatureCollection<Point> {
  if (!geometry) return { type: 'FeatureCollection', features: [] };

  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(1);
  const features: Feature<Point>[] = [];

  for (const ring of rings) {
    const len = ring.length;
    if (len < 2) continue;
    // Last point duplicates the first on a closed ring.
    const count = len > 1 && ring[0]![0] === ring[len - 1]![0] && ring[0]![1] === ring[len - 1]![1] ? len - 1 : len;
    for (let i = 0; i < count; i++) {
      const c = ring[i]!;
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [c[0]!, c[1]!] },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

/** Ensure the vertex circle overlay exists and matches the current selection. */
export function syncSelectionVerticesOverlay(map: MaplibreMap, geometry: SelectionGeometry | null): void {
  const data = selectionVerticesCollection(geometry);

  if (!map.getSource(SELECTION_VERTICES_SOURCE)) {
    map.addSource(SELECTION_VERTICES_SOURCE, { type: 'geojson', data });
  } else {
    (map.getSource(SELECTION_VERTICES_SOURCE) as GeoJSONSource).setData(data);
  }

  if (!map.getLayer(SELECTION_VERTICES_LAYER)) {
    map.addLayer({
      id: SELECTION_VERTICES_LAYER,
      type: 'circle',
      source: SELECTION_VERTICES_SOURCE,
      paint: {
        'circle-radius': 4,
        'circle-color': '#e8eef5',
        'circle-stroke-width': 2,
        'circle-stroke-color': tokens.color.accent,
        'circle-opacity': 1,
      },
    });
  }

  // Keep overlay on top of basemap / style layers (Terra Draw may still sit above).
  try {
    map.moveLayer(SELECTION_VERTICES_LAYER);
  } catch {
    // layer may not be movable yet
  }
}

export function clearSelectionVerticesOverlay(map: MaplibreMap): void {
  if (map.getLayer(SELECTION_VERTICES_LAYER)) map.removeLayer(SELECTION_VERTICES_LAYER);
  if (map.getSource(SELECTION_VERTICES_SOURCE)) map.removeSource(SELECTION_VERTICES_SOURCE);
}

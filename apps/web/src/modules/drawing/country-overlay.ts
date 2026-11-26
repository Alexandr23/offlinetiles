import type { SelectionGeometry } from '@map-exporter/contracts';
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import { tokens } from '@/shared/styles/tokens';

export const COUNTRY_SOURCE = 'me-country-selection';
export const COUNTRY_FILL_LAYER = 'me-country-selection-fill';
export const COUNTRY_LINE_LAYER = 'me-country-selection-line';
export const COUNTRY_STRIPES_IMAGE = 'me-country-stripes';

const STRIPE_TILE = 18;
const STRIPE_WIDTH = 4;
const PIXEL_RATIO = 2;

/** Seamless 45° stripe tile in the selection colour, used as `fill-pattern`. */
function stripesImage(): ImageData | null {
  const size = STRIPE_TILE * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.strokeStyle = tokens.color.selection;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = STRIPE_WIDTH * PIXEL_RATIO;
  ctx.lineCap = 'square';
  ctx.beginPath();
  // Three segments (corner, diagonal, corner) so the stripes line up across tile edges.
  for (const offset of [-size, 0, size]) {
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export function ensureCountryStripesImage(map: MaplibreMap): void {
  if (map.hasImage(COUNTRY_STRIPES_IMAGE)) return;
  const image = stripesImage();
  if (image) map.addImage(COUNTRY_STRIPES_IMAGE, image, { pixelRatio: PIXEL_RATIO });
}

/**
 * Read-only rendering of a country selection: striped fill + outline. Countries are not
 * loaded into Terra Draw, so they cannot be dragged or have their vertices edited.
 */
export function syncCountryOverlay(map: MaplibreMap, geometry: SelectionGeometry | null): void {
  const data = geometry
    ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry }] }
    : { type: 'FeatureCollection' as const, features: [] };

  ensureCountryStripesImage(map);

  if (!map.getSource(COUNTRY_SOURCE)) {
    map.addSource(COUNTRY_SOURCE, { type: 'geojson', data });
  } else {
    (map.getSource(COUNTRY_SOURCE) as GeoJSONSource).setData(data);
  }

  if (!map.getLayer(COUNTRY_FILL_LAYER)) {
    map.addLayer({
      id: COUNTRY_FILL_LAYER,
      type: 'fill',
      source: COUNTRY_SOURCE,
      paint: { 'fill-pattern': COUNTRY_STRIPES_IMAGE },
    });
  }
  if (!map.getLayer(COUNTRY_LINE_LAYER)) {
    map.addLayer({
      id: COUNTRY_LINE_LAYER,
      type: 'line',
      source: COUNTRY_SOURCE,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': tokens.color.selection, 'line-width': 1.5 },
    });
  }

  // Keep above basemap layers added by later style swaps.
  try {
    map.moveLayer(COUNTRY_FILL_LAYER);
    map.moveLayer(COUNTRY_LINE_LAYER);
  } catch {
    // layers may not be movable yet
  }
}

export function clearCountryOverlay(map: MaplibreMap): void {
  if (map.getLayer(COUNTRY_LINE_LAYER)) map.removeLayer(COUNTRY_LINE_LAYER);
  if (map.getLayer(COUNTRY_FILL_LAYER)) map.removeLayer(COUNTRY_FILL_LAYER);
  if (map.getSource(COUNTRY_SOURCE)) map.removeSource(COUNTRY_SOURCE);
}

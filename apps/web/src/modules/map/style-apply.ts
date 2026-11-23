import type maplibregl from 'maplibre-gl';
import type { MapLibreStyle } from '@map-exporter/contracts';

/** Prefixes of sources/layers owned by overlays (Terra Draw uses `td-`). */
const OVERLAY_PREFIXES = ['td-', 'td', 'me-'];

function isOverlayId(id: string): boolean {
  return OVERLAY_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * Applies a new style with MapLibre's diffing, while keeping overlay sources and
 * layers (drawing tools) that are not part of the authored style.
 */
export function applyStylePreservingOverlays(map: maplibregl.Map, style: MapLibreStyle): void {
  let current: maplibregl.StyleSpecification | undefined;
  try {
    current = map.getStyle();
  } catch {
    current = undefined;
  }

  const next = { ...style, sources: { ...style.sources }, layers: [...style.layers] } as maplibregl.StyleSpecification;

  if (current) {
    for (const [id, source] of Object.entries(current.sources ?? {})) {
      if (isOverlayId(id) && !(id in next.sources)) {
        next.sources[id] = source;
      }
    }
    for (const layer of current.layers ?? []) {
      if (isOverlayId(layer.id) && !next.layers.some((l) => l.id === layer.id)) {
        next.layers.push(layer);
      }
    }
  }

  map.setStyle(next, { diff: true });
}

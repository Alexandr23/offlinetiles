import type { Position } from 'geojson';
import type { Map as MaplibreMap } from 'maplibre-gl';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RESTORE_FALLBACK_MS = 1000;

export interface DragPreviewStyle {
  fill: string;
  fillOpacity: number;
  outline: string;
  outlineWidth: number;
  point: { fill: string; outline: string; outlineWidth: number };
  midPoint: { fill: string; outline: string; width: number; outlineWidth: number };
}

export interface DragPreviewFeature {
  rings: Position[][];
  selected: boolean;
  midpoints: boolean;
}

export interface DragPreview {
  render: (features: DragPreviewFeature[], pointRadius: number) => void;
  /** Keeps the preview until the map layers have rendered the final geometry, then removes it. */
  finish: () => void;
  reset: () => void;
}

const fmt = (n: number) => n.toFixed(1);

function circle(x: number, y: number, r: number, fill: string, stroke: string, strokeWidth: number): string {
  return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

/**
 * Terra Draw renders through MapLibre GeoJSON sources, which reach the screen ~3 frames after the
 * pointer moves (worker parse + re-tile). While a shape is dragged, an SVG copy follows the
 * pointer in the same frame and the lagging map layers are hidden.
 */
export function createDragPreview(map: MaplibreMap, layerIds: string[], style: DragPreviewStyle): DragPreview {
  let svg: SVGSVGElement | null = null;
  let hiddenLayers: string[] = [];
  let token = 0;

  const ensureSvg = () => {
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
    map.getCanvasContainer().appendChild(svg);
    return svg;
  };

  const removeSvg = () => {
    svg?.remove();
    svg = null;
  };

  const hideLayers = () => {
    if (hiddenLayers.length > 0) return;
    hiddenLayers = layerIds.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    for (const id of hiddenLayers) map.setLayoutProperty(id, 'visibility', 'none');
  };

  const restoreLayers = () => {
    for (const id of hiddenLayers) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    }
    hiddenLayers = [];
  };

  const render = (features: DragPreviewFeature[], pointRadius: number) => {
    token++;
    hideLayers();
    let shapes = '';
    let points = '';
    for (const feature of features) {
      const rings = feature.rings.map((ring) => ring.map((c) => map.project([c[0]!, c[1]!])));
      const d = rings
        .filter((ring) => ring.length > 1)
        .map((ring) => `M${ring.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join('L')}Z`)
        .join('');
      shapes += `<path d="${d}"/>`;
      if (!feature.selected) continue;

      for (const ring of rings) {
        const closed = ring.length > 1 && ring[0]!.x === ring[ring.length - 1]!.x && ring[0]!.y === ring[ring.length - 1]!.y;
        const count = closed ? ring.length - 1 : ring.length;
        if (feature.midpoints) {
          const mp = style.midPoint;
          for (let i = 0; i < count; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % count]!;
            points += circle((a.x + b.x) / 2, (a.y + b.y) / 2, mp.width, mp.fill, mp.outline, mp.outlineWidth);
          }
        }
        const pt = style.point;
        for (let i = 0; i < count; i++) {
          points += circle(ring[i]!.x, ring[i]!.y, pointRadius, pt.fill, pt.outline, pt.outlineWidth);
        }
      }
    }
    ensureSvg().innerHTML =
      `<g fill="${style.fill}" fill-opacity="${style.fillOpacity}" fill-rule="evenodd" stroke="${style.outline}" ` +
      `stroke-width="${style.outlineWidth}" stroke-linejoin="round">${shapes}</g>${points}`;
  };

  const finish = () => {
    const current = ++token;
    let sources: string[] = [];
    const done = () => {
      map.off('render', onRender);
      if (current === token) removeSvg();
    };
    // Hidden layers drop their tiles; the SVG stays until the reloaded tiles have been painted.
    const onRender = () => {
      if (current !== token || sources.every((id) => !map.getSource(id) || map.isSourceLoaded(id))) done();
    };
    // Two frames: Terra Draw's adapter pushes the final geometry to MapLibre on the next one.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (current !== token) return;
        sources = [...new Set(hiddenLayers.map((id) => map.getLayer(id)?.source).filter((s): s is string => !!s))];
        restoreLayers();
        map.on('render', onRender);
        window.setTimeout(done, RESTORE_FALLBACK_MS);
      }),
    );
  };

  const reset = () => {
    token++;
    restoreLayers();
    removeSvg();
  };

  return { render, finish, reset };
}

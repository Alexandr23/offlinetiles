import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { landingTokens } from './landing.tokens';

export const UAE_SOURCE = 'uae';
export const UAE_FILL_LAYER = 'uae-fill';

/** Parts of the UAE outline that grow independently (see scripts/build-uae-outline.mjs). */
export type OutlinePart = 'main' | 'rest';

export const OUTLINE_PARTS: OutlinePart[] = ['main', 'rest'];

/** Glow stack, widest/softest first. All layers of a part share one growing gradient. */
const GLOW_LAYERS = [
  { id: 'halo', width: 13, blur: 9, opacity: 0.34 },
  { id: 'glow', width: 6, blur: 3, opacity: 0.6 },
  { id: 'core', width: 2.2, blur: 0, opacity: 1 },
] as const;

export const glowLayerId = (part: OutlinePart, id: (typeof GLOW_LAYERS)[number]['id']) => `uae-${part}-${id}`;
export const glowLayerIds = () => OUTLINE_PARTS.flatMap((part) => GLOW_LAYERS.map((l) => glowLayerId(part, l.id)));

const COLORS = {
  land: '#131f35',
  water: '#050a14',
  border: 'rgba(148, 163, 184, 0.2)',
  country: '#8ba0bd',
  place: '#5d708c',
  water_label: '#2d3f5a',
  /** The outline is a selection, so it takes the selection pink. */
  glow: landingTokens.cut,
} as const;

type Rgba = readonly [number, number, number, number];

const [GLOW_R, GLOW_G, GLOW_B] = [1, 3, 5].map((at) => parseInt(COLORS.glow.slice(at, at + 2), 16)) as [
  number,
  number,
  number,
];
const glow = (alpha: number): Rgba => [GLOW_R, GLOW_G, GLOW_B, alpha];

const CLEAR = glow(0);
const TAIL = glow(0.5);
/** The comet head: the glow colour heated almost to white. */
const HEAD: Rgba = [255, 232, 241, 1];
/** Colour of the finished outline once the comet head has cooled down. */
const SETTLED = glow(0.95);
/** Length of the bright comet trail behind the head, as a share of the line. */
const COMET = 0.12;

const mix = (a: Rgba, b: Rgba, k: number) => a.map((v, i) => v + (b[i]! - v) * k) as unknown as Rgba;
const css = (c: Rgba) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${+c[3].toFixed(3)})`;

/**
 * `line-gradient` that paints the line from its start up to `progress` (0..1) with a bright
 * comet head. `heat` 1 = glowing head, 0 = uniformly settled line. Updating this paint property is
 * much cheaper than re-slicing GeoJSON every frame.
 */
export function growingGradient(progress: number, heat = 1): ExpressionSpecification {
  const stops: (number | string)[] = [];
  const push = (at: number, color: Rgba) => stops.push(at, css(color));

  if (progress <= 0.0005) {
    push(0, CLEAR);
    push(1, CLEAR);
  } else {
    const tail = mix(SETTLED, TAIL, heat);
    const head = Math.min(progress, 0.998);
    const trailStart = head - COMET;
    push(0, tail);
    if (trailStart > 0.001) push(trailStart, tail);
    push(head, mix(SETTLED, HEAD, heat));
    const end = Math.min(head + 0.004, 1);
    push(end, CLEAR);
  }
  return ['interpolate', ['linear'], ['line-progress'], ...stops] as ExpressionSpecification;
}

/** Peak opacity of each glow layer (before the cycle's fade multiplier). */
export const glowLayerOpacity = (layerId: string) =>
  GLOW_LAYERS.find((l) => layerId.endsWith(`-${l.id}`))?.opacity ?? 1;

const textFont = ['Noto Sans Regular'];

export function createHeroMapStyle(uaeUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      [UAE_SOURCE]: { type: 'geojson', data: uaeUrl, lineMetrics: true },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': COLORS.land } },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': COLORS.water },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': COLORS.border,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.4],
        },
      },
      {
        id: UAE_FILL_LAYER,
        type: 'fill',
        source: UAE_SOURCE,
        filter: ['==', ['get', 'kind'], 'fill'],
        paint: { 'fill-color': COLORS.glow, 'fill-opacity': 0 },
      },
      ...OUTLINE_PARTS.flatMap((part) =>
        GLOW_LAYERS.map((l) => ({
          id: glowLayerId(part, l.id),
          type: 'line' as const,
          source: UAE_SOURCE,
          filter: ['==', ['get', 'kind'], part] as ExpressionSpecification,
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: {
            'line-width': l.width,
            'line-blur': l.blur,
            'line-opacity': l.opacity,
            'line-gradient': growingGradient(0),
          },
        })),
      ),
      {
        id: 'water-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        filter: ['match', ['get', 'class'], ['sea', 'ocean'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': textFont,
          'text-size': 12,
          'text-letter-spacing': 0.35,
          'text-transform': 'uppercase',
        },
        paint: { 'text-color': COLORS.water_label },
      },
      {
        id: 'city-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 4,
        filter: ['all', ['==', ['get', 'class'], 'city'], ['<=', ['get', 'rank'], 3]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': textFont,
          'text-size': 11,
          'text-anchor': 'center',
        },
        paint: { 'text-color': COLORS.place, 'text-halo-color': COLORS.land, 'text-halo-width': 1.5 },
      },
      {
        id: 'country-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': textFont,
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 6, 13],
          'text-letter-spacing': 0.28,
          'text-transform': 'uppercase',
          'text-max-width': 8,
        },
        paint: { 'text-color': COLORS.country, 'text-halo-color': COLORS.land, 'text-halo-width': 2 },
      },
    ],
  };
}

import type { MapLibreStyle } from '@map-exporter/contracts';
import { hexToRgb, normalizeHexColor, rgbToHex } from '@/shared/utils/color';

/**
 * User-friendly view over a MapLibre style. The style JSON stays canonical; this
 * module only reads/writes well-known layers (identified by `metadata["me:group"]`).
 */
export interface StyleParams {
  background: { color: string };
  water: { color: string };
  land: { color: string };
  parks: { color: string; visible: boolean };
  buildings: { color: string; opacity: number; visible: boolean };
  roads: { motorway: string; primary: string; secondary: string; widthScale: number; visible: boolean };
  boundaries: { color: string; visible: boolean };
  labels: {
    countries: boolean;
    cities: boolean;
    roads: boolean;
    pois: boolean;
    color: string;
    sizeScale: number;
    visible: boolean;
  };
}

type Layer = Record<string, unknown> & {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const LABEL_GROUPS = ['labels-water', 'labels-roads', 'labels-poi', 'labels-cities', 'labels-countries'] as const;

function layers(style: MapLibreStyle): Layer[] {
  return style.layers as Layer[];
}

function group(layer: Layer): string | undefined {
  return layer.metadata?.['me:group'] as string | undefined;
}

function byId(style: MapLibreStyle, id: string): Layer | undefined {
  return layers(style).find((l) => l.id === id);
}

function paintColor(layer: Layer | undefined, prop: string, fallback = '#000000'): string {
  const v = layer?.paint?.[prop];
  return (typeof v === 'string' ? normalizeHexColor(v) : null) ?? fallback;
}

function isVisible(layer: Layer | undefined): boolean {
  return layer?.layout?.visibility !== 'none';
}

function meta(style: MapLibreStyle): Record<string, unknown> {
  return ((style.metadata?.['map-exporter'] as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function lastNumber(expr: unknown, fallback: number): number {
  if (typeof expr === 'number') return expr;
  if (Array.isArray(expr) && expr[0] === 'interpolate') {
    const last = expr[expr.length - 1];
    return typeof last === 'number' ? last : fallback;
  }
  return fallback;
}

/** Multiplies the numeric outputs of a number or an `interpolate` zoom expression. */
export function scaleNumeric(expr: unknown, factor: number): unknown {
  if (typeof expr === 'number') return round(expr * factor);
  if (Array.isArray(expr) && expr[0] === 'interpolate') {
    return expr.map((v, i) => (i >= 4 && i % 2 === 0 && typeof v === 'number' ? round(v * factor) : v));
  }
  if (Array.isArray(expr) && expr[0] === 'step') {
    return expr.map((v, i) => (i >= 2 && i % 2 === 0 && typeof v === 'number' ? round(v * factor) : v));
  }
  return expr;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => (amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return rgbToHex(f(r), f(g), f(b));
}

export function readStyleParams(style: MapLibreStyle): StyleParams {
  const m = meta(style);
  const labelLayers = layers(style).filter((l) => LABEL_GROUPS.includes(group(l) as (typeof LABEL_GROUPS)[number]));
  const labelColorLayer = byId(style, 'label-place-city') ?? labelLayers[0];
  const building = byId(style, 'building');
  return {
    background: { color: paintColor(byId(style, 'background'), 'background-color', '#ffffff') },
    water: { color: paintColor(byId(style, 'water'), 'fill-color', '#a8cce0') },
    land: { color: paintColor(byId(style, 'landcover-grass'), 'fill-color', '#dfe9d6') },
    parks: { color: paintColor(byId(style, 'park'), 'fill-color', '#cfe5c2'), visible: isVisible(byId(style, 'park')) },
    buildings: {
      color: paintColor(building, 'fill-color', '#dcd6cb'),
      opacity: lastNumber(building?.paint?.['fill-opacity'], 1),
      visible: isVisible(building),
    },
    roads: {
      motorway: paintColor(byId(style, 'road-motorway'), 'line-color', '#f3b76b'),
      primary: paintColor(byId(style, 'road-primary'), 'line-color', '#f8dd9f'),
      secondary: paintColor(byId(style, 'road-secondary'), 'line-color', '#ffffff'),
      widthScale: typeof m.roadWidthScale === 'number' ? m.roadWidthScale : 1,
      visible: layers(style).some((l) => group(l) === 'roads' && isVisible(l)),
    },
    boundaries: {
      color: paintColor(byId(style, 'boundary-admin-2'), 'line-color', '#9a8ea8'),
      visible: layers(style).some((l) => group(l) === 'boundaries' && isVisible(l)),
    },
    labels: {
      countries: isVisible(byId(style, 'label-place-country')),
      cities: isVisible(byId(style, 'label-place-city')),
      roads: isVisible(byId(style, 'label-road')),
      pois: isVisible(byId(style, 'label-poi')),
      color: paintColor(labelColorLayer, 'text-color', '#333333'),
      sizeScale: typeof m.labelSizeScale === 'number' ? m.labelSizeScale : 1,
      visible: labelLayers.some(isVisible),
    },
  };
}

export type StyleParamPatch =
  | { section: 'background'; key: 'color'; value: string }
  | { section: 'water'; key: 'color'; value: string }
  | { section: 'land'; key: 'color'; value: string }
  | { section: 'parks'; key: 'color'; value: string }
  | { section: 'parks'; key: 'visible'; value: boolean }
  | { section: 'buildings'; key: 'color'; value: string }
  | { section: 'buildings'; key: 'opacity'; value: number }
  | { section: 'buildings'; key: 'visible'; value: boolean }
  | { section: 'roads'; key: 'motorway' | 'primary' | 'secondary'; value: string }
  | { section: 'roads'; key: 'widthScale'; value: number }
  | { section: 'roads'; key: 'visible'; value: boolean }
  | { section: 'boundaries'; key: 'color'; value: string }
  | { section: 'boundaries'; key: 'visible'; value: boolean }
  | { section: 'labels'; key: 'countries' | 'cities' | 'roads' | 'pois' | 'visible'; value: boolean }
  | { section: 'labels'; key: 'color'; value: string }
  | { section: 'labels'; key: 'sizeScale'; value: number };

/** Returns a new style with the patch applied. Never mutates the input. */
export function applyStyleParam(style: MapLibreStyle, patch: StyleParamPatch): MapLibreStyle {
  const next: MapLibreStyle = {
    ...style,
    metadata: { ...(style.metadata ?? {}), 'map-exporter': { ...meta(style) } },
    layers: layers(style).map((l) => ({ ...l, paint: { ...(l.paint ?? {}) }, layout: { ...(l.layout ?? {}) } })),
  };
  const ls = layers(next);
  const setPaint = (pred: (l: Layer) => boolean, prop: string, value: unknown) => {
    for (const l of ls) if (pred(l)) l.paint![prop] = value;
  };
  const setVisible = (pred: (l: Layer) => boolean, visible: boolean) => {
    for (const l of ls) if (pred(l)) l.layout!.visibility = visible ? 'visible' : 'none';
  };
  const inGroup = (g: string) => (l: Layer) => group(l) === g;
  const withId = (id: string) => (l: Layer) => l.id === id;
  const m = next.metadata!['map-exporter'] as Record<string, unknown>;

  switch (patch.section) {
    case 'background':
      setPaint(withId('background'), 'background-color', patch.value);
      setPaint(withId('building'), 'fill-outline-color', patch.value);
      break;
    case 'water':
      setPaint(withId('water'), 'fill-color', patch.value);
      setPaint(withId('waterway'), 'line-color', patch.value);
      break;
    case 'land':
      setPaint((l) => l.metadata?.['me:land-role'] === 'land', 'fill-color', patch.value);
      setPaint((l) => l.metadata?.['me:land-role'] === 'residential', 'fill-color', shade(patch.value, 0.35));
      setPaint((l) => l.metadata?.['me:land-role'] === 'aeroway', 'fill-color', shade(patch.value, 0.2));
      setPaint((l) => l.metadata?.['me:land-role'] === 'wood', 'fill-color', shade(patch.value, -0.08));
      break;
    case 'parks':
      if (patch.key === 'color') {
        setPaint(withId('park'), 'fill-color', patch.value);
        setPaint(withId('park-outline'), 'line-color', patch.value);
      } else setVisible(inGroup('parks'), patch.value);
      break;
    case 'buildings':
      if (patch.key === 'color') setPaint(withId('building'), 'fill-color', patch.value);
      else if (patch.key === 'opacity') {
        setPaint(withId('building'), 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, round(patch.value)]);
      } else setVisible(inGroup('buildings'), patch.value);
      break;
    case 'roads':
      if (patch.key === 'visible') setVisible(inGroup('roads'), patch.value);
      else if (patch.key === 'widthScale') {
        m.roadWidthScale = patch.value;
        for (const l of ls) {
          if (group(l) === 'roads' && l.metadata?.['me:base-width'] !== undefined) {
            l.paint!['line-width'] = scaleNumeric(l.metadata['me:base-width'], patch.value);
          }
        }
      } else {
        setPaint(withId(`road-${patch.key}`), 'line-color', patch.value);
        setPaint(withId(`road-${patch.key}-casing`), 'line-color', shade(patch.value, -0.18));
      }
      break;
    case 'boundaries':
      if (patch.key === 'color') setPaint(inGroup('boundaries'), 'line-color', patch.value);
      else setVisible(inGroup('boundaries'), patch.value);
      break;
    case 'labels': {
      const isLabel = (l: Layer) => LABEL_GROUPS.includes(group(l) as (typeof LABEL_GROUPS)[number]);
      if (patch.key === 'color') {
        setPaint((l) => isLabel(l) && group(l) !== 'labels-water', 'text-color', patch.value);
        setPaint(inGroup('labels-water'), 'text-color', shade(patch.value, 0.1));
      } else if (patch.key === 'sizeScale') {
        m.labelSizeScale = patch.value;
        for (const l of ls) {
          if (isLabel(l) && l.metadata?.['me:base-size'] !== undefined) {
            l.layout!['text-size'] = scaleNumeric(l.metadata['me:base-size'], patch.value);
          }
        }
      } else if (patch.key === 'visible') setVisible(isLabel, patch.value);
      else if (patch.key === 'countries') setVisible(inGroup('labels-countries'), patch.value);
      else if (patch.key === 'cities') setVisible(inGroup('labels-cities'), patch.value);
      else if (patch.key === 'roads') setVisible(inGroup('labels-roads'), patch.value);
      else if (patch.key === 'pois') setVisible(inGroup('labels-poi'), patch.value);
      break;
    }
  }
  return next;
}

/** Structural equality on the serialized style – good enough to detect "dirty" state. */
export function stylesEqual(a: MapLibreStyle | null, b: MapLibreStyle | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

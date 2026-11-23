import type { MapLibreStyle, PresetId } from '@map-exporter/contracts';
import dark from './dark.json';
import light from './light.json';
import minimal from './minimal.json';
import outdoor from './outdoor.json';
import streets from './streets.json';

export interface StylePreset {
  id: PresetId;
  name: string;
  description: string;
  style: MapLibreStyle;
  /** Swatches shown in the preset gallery preview. */
  swatches: { bg: string; water: string; road: string; park: string; label: string };
}

export type StyleSwatches = StylePreset['swatches'];

/** Pulls a compact palette from well-known layers for thumbnail previews. */
export function swatchesOf(style: MapLibreStyle): StyleSwatches {
  const paint = (id: string, prop: string, fallback: string): string => {
    const layer = style.layers.find((l) => l.id === id) as { paint?: Record<string, unknown> } | undefined;
    const v = layer?.paint?.[prop];
    return typeof v === 'string' ? v : fallback;
  };
  return {
    bg: paint('background', 'background-color', '#000'),
    water: paint('water', 'fill-color', '#000'),
    road: paint('road-primary', 'line-color', '#fff'),
    park: paint('park', 'fill-color', '#000'),
    label: paint('label-place-city', 'text-color', '#fff'),
  };
}

const defs: Array<Omit<StylePreset, 'swatches'>> = [
  { id: 'light', name: 'Light', description: 'Neutral daylight basemap', style: light as MapLibreStyle },
  { id: 'dark', name: 'Dark', description: 'Low-light technical palette', style: dark as MapLibreStyle },
  { id: 'streets', name: 'Streets', description: 'Emphasised road hierarchy', style: streets as MapLibreStyle },
  { id: 'minimal', name: 'Minimal', description: 'Monochrome, labels only where needed', style: minimal as MapLibreStyle },
  { id: 'outdoor', name: 'Outdoor', description: 'Terrain-leaning greens and trails', style: outdoor as MapLibreStyle },
];

/** Built-in presets. Immutable: editing creates a working copy. */
export const PRESETS: readonly StylePreset[] = Object.freeze(
  defs.map((d) => Object.freeze({ ...d, swatches: swatchesOf(d.style) })),
);

export function getPreset(id: PresetId): StylePreset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`unknown preset ${id}`);
  return preset;
}

export function clonePresetStyle(id: PresetId): MapLibreStyle {
  return structuredClone(getPreset(id).style);
}

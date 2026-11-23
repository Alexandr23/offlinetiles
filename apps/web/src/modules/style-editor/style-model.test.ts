import type { MapLibreStyle } from '@map-exporter/contracts';
import { describe, expect, it } from 'vitest';
import { PRESETS, clonePresetStyle, getPreset } from './presets';
import { applyStyleParam, readStyleParams, scaleNumeric, stylesEqual } from './style-model';

type Layer = { id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
const layer = (style: MapLibreStyle, id: string) => style.layers.find((l) => l.id === id) as Layer | undefined;

describe('presets', () => {
  it('ships the five built-in presets with the layers the editor relies on', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['light', 'dark', 'streets', 'minimal', 'outdoor']);
    for (const preset of PRESETS) {
      const ids = new Set(preset.style.layers.map((l) => l.id));
      for (const required of ['background', 'water', 'park', 'building', 'road-primary', 'label-place-city']) {
        expect(ids.has(required), `${preset.id} is missing ${required}`).toBe(true);
      }
      expect(preset.style.version).toBe(8);
      expect(preset.style.glyphs).toContain('{fontstack}');
      expect(preset.swatches.bg).toMatch(/^#/);
    }
  });

  it('clonePresetStyle returns an independent deep copy', () => {
    const clone = clonePresetStyle('light');
    expect(clone).toEqual(getPreset('light').style);
    expect(clone).not.toBe(getPreset('light').style);
    (layer(clone, 'water')!.paint as Record<string, unknown>)['fill-color'] = '#000000';
    expect(layer(getPreset('light').style, 'water')!.paint!['fill-color']).not.toBe('#000000');
  });
});

describe('scaleNumeric', () => {
  it('scales plain numbers and the outputs of interpolate / step expressions only', () => {
    expect(scaleNumeric(2, 1.5)).toBe(3);
    expect(scaleNumeric(['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.5, 14, 4], 2)).toEqual([
      'interpolate',
      ['exponential', 1.5],
      ['zoom'],
      5,
      1,
      14,
      8,
    ]);
    expect(scaleNumeric(['step', ['zoom'], 1, 10, 2], 3)).toEqual(['step', ['zoom'], 3, 10, 6]);
    expect(scaleNumeric(['get', 'width'], 3)).toEqual(['get', 'width']);
  });
});

describe('readStyleParams / applyStyleParam', () => {
  it('reads sane defaults from every preset', () => {
    for (const preset of PRESETS) {
      const params = readStyleParams(preset.style);
      expect(params.background.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(params.water.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(params.roads.widthScale).toBe(1);
      expect(params.labels.sizeScale).toBe(1);
      expect(params.roads.visible).toBe(true);
    }
  });

  it('applies colour patches immutably and reads them back', () => {
    const base = clonePresetStyle('light');
    const before = JSON.stringify(base);
    const next = applyStyleParam(base, { section: 'water', key: 'color', value: '#123456' });
    expect(JSON.stringify(base)).toBe(before);
    expect(readStyleParams(next).water.color).toBe('#123456');
    expect(layer(next, 'waterway')?.paint?.['line-color']).toBe('#123456');
    expect(stylesEqual(base, next)).toBe(false);
    expect(stylesEqual(base, clonePresetStyle('light'))).toBe(true);
  });

  it('toggles visibility by group and scales road widths from the recorded base width', () => {
    const base = clonePresetStyle('streets');
    const hidden = applyStyleParam(base, { section: 'roads', key: 'visible', value: false });
    expect(readStyleParams(hidden).roads.visible).toBe(false);
    expect(layer(hidden, 'road-primary')?.layout?.visibility).toBe('none');
    const shown = applyStyleParam(hidden, { section: 'roads', key: 'visible', value: true });
    expect(readStyleParams(shown).roads.visible).toBe(true);

    const wide = applyStyleParam(base, { section: 'roads', key: 'widthScale', value: 2 });
    expect(readStyleParams(wide).roads.widthScale).toBe(2);
    const primary = layer(base, 'road-primary') as Layer & { metadata?: Record<string, unknown> };
    const expected = scaleNumeric(primary.metadata?.['me:base-width'], 2);
    expect(layer(wide, 'road-primary')?.paint?.['line-width']).toEqual(expected);
    // Scaling is always relative to the base width, never cumulative.
    const back = applyStyleParam(wide, { section: 'roads', key: 'widthScale', value: 1 });
    expect(layer(back, 'road-primary')?.paint?.['line-width']).toEqual(primary.paint?.['line-width']);
  });

  it('controls label groups independently', () => {
    const base = clonePresetStyle('dark');
    const noCities = applyStyleParam(base, { section: 'labels', key: 'cities', value: false });
    const params = readStyleParams(noCities);
    expect(params.labels.cities).toBe(false);
    expect(params.labels.countries).toBe(true);
    const none = applyStyleParam(noCities, { section: 'labels', key: 'visible', value: false });
    expect(readStyleParams(none).labels.visible).toBe(false);
    const bigger = applyStyleParam(base, { section: 'labels', key: 'sizeScale', value: 1.25 });
    expect(readStyleParams(bigger).labels.sizeScale).toBe(1.25);
  });

  it('building opacity is written as a zoom ramp ending at the requested value', () => {
    const next = applyStyleParam(clonePresetStyle('light'), { section: 'buildings', key: 'opacity', value: 0.42 });
    expect(readStyleParams(next).buildings.opacity).toBe(0.42);
    expect(layer(next, 'building')?.paint?.['fill-opacity']).toEqual(['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 0.42]);
  });
});

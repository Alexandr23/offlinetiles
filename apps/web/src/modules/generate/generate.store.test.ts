import type { Generation } from '@map-exporter/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildGenerationName, useGenerateStore } from './generate.store';

describe('generate store', () => {
  beforeEach(() => {
    useGenerateStore.setState({
      name: '',
      nameTouched: false,
      content: 'vector',
      container: 'mbtiles',
      minZoom: 8,
      maxZoom: 14,
      tileSize: 256,
      estimate: null,
      estimateStatus: 'idle',
      estimateError: null,
      submitting: false,
    });
  });

  it('normalizes inverted zoom ranges', () => {
    useGenerateStore.getState().setZoomRange(14, 8);
    expect(useGenerateStore.getState()).toMatchObject({ minZoom: 8, maxZoom: 14 });
  });

  it('buildGenerationName uses style name and zoom range', () => {
    expect(buildGenerationName('Light', 8, 14)).toBe('Light Z8–14');
    expect(buildGenerationName('  Streets  ', 12, 12)).toBe('Streets Z12');
  });

  it('populateFrom copies a generation into the draft without submitting', () => {
    const generation = {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Berlin raster',
      content: 'raster',
      container: 'mbtiles',
      minZoom: 10,
      maxZoom: 16,
      raster: { format: 'png', tileSize: 512 },
    } as Generation;
    useGenerateStore.getState().populateFrom(generation);
    expect(useGenerateStore.getState()).toMatchObject({
      name: 'Berlin raster',
      nameTouched: false,
      content: 'raster',
      container: 'mbtiles',
      minZoom: 10,
      maxZoom: 16,
      tileSize: 512,
      submitting: false,
    });
  });
});

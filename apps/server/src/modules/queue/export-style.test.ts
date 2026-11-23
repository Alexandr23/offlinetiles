import type { ArtifactManifest, MapLibreStyle } from '@map-exporter/contracts';
import { describe, expect, it } from 'vitest';
import { buildExportStyle } from './export-style.js';

const manifest: ArtifactManifest = {
  version: 1,
  jobId: '7f9c2d6e-4b1a-4c3d-9e8f-0a1b2c3d4e5f',
  name: 'Monaco export',
  content: 'vector',
  container: 'mbtiles',
  raster: null,
  minZoom: 8,
  maxZoom: 14,
  tileCount: 10,
  bytes: 100,
  bounds: [7.4, 43.7, 7.5, 43.8],
  datasetVersion: '20261003T120000Z-abcdef01',
  styleName: 'Light',
  createdAt: '2026-10-03T12:00:00.000Z',
  completedAt: '2026-10-03T12:01:00.000Z',
  files: { tiles: 'map.mbtiles', style: 'style.json' },
};

const snapshot: MapLibreStyle = {
  version: 8,
  glyphs: '/api/assets/fonts/{fontstack}/{range}.pbf',
  sources: {
    master: { type: 'vector', url: '/api/tiles.json' },
    direct: { type: 'vector', tiles: ['/api/tiles/{z}/{x}/{y}.pbf', 'https://cdn.example/{z}/{x}/{y}.pbf'] },
  },
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#fff' } }],
};

describe('buildExportStyle', () => {
  it('absolutizes application-relative URLs and records export metadata', () => {
    const out = buildExportStyle(snapshot, { apiUrl: 'http://localhost:3000/', manifest });

    expect(out.glyphs).toBe('http://localhost:3000/api/assets/fonts/{fontstack}/{range}.pbf');
    expect(out.sources.master).toEqual({ type: 'vector', url: 'http://localhost:3000/api/tiles.json' });
    expect(out.sources.direct).toEqual({
      type: 'vector',
      tiles: ['http://localhost:3000/api/tiles/{z}/{x}/{y}.pbf', 'https://cdn.example/{z}/{x}/{y}.pbf'],
    });
    expect(out.name).toBe('Light');
    expect(out.layers).toEqual(snapshot.layers);
    expect(out.metadata).toEqual({
      'map-exporter': {
        jobId: manifest.jobId,
        tiles: 'map.mbtiles',
        content: 'vector',
        container: 'mbtiles',
        minZoom: 8,
        maxZoom: 14,
        bounds: [7.4, 43.7, 7.5, 43.8],
      },
    });
  });

  it('does not mutate the snapshot and preserves existing names/metadata', () => {
    const named: MapLibreStyle = { ...snapshot, name: 'Custom', metadata: { author: 'me' } };
    const before = JSON.stringify(named);
    const out = buildExportStyle(named, { apiUrl: 'http://x', manifest });
    expect(JSON.stringify(named)).toBe(before);
    expect(out.name).toBe('Custom');
    expect(out.metadata).toMatchObject({ author: 'me' });
  });

  it('falls back to the job name when neither style nor manifest has a style name', () => {
    const out = buildExportStyle(snapshot, { apiUrl: 'http://x', manifest: { ...manifest, styleName: null } });
    expect(out.name).toBe('Monaco export');
  });
});

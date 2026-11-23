import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraForTile, tileCenter } from '../src/tile-math.js';
import { rewriteStyleForRenderer } from '../src/style-rewrite.js';

test('tile center of 0/0/0 is the origin', () => {
  const [lon, lat] = tileCenter(0, 0, 0);
  assert.ok(Math.abs(lon) < 1e-9);
  assert.ok(Math.abs(lat) < 1e-9);
});

test('tile center of 1/0/0 is in the north-west quadrant', () => {
  const [lon, lat] = tileCenter(1, 0, 0);
  assert.equal(lon, -90);
  assert.ok(lat > 60 && lat < 70);
});

test('256px tiles render at zoom z-1, 512px at z', () => {
  assert.equal(cameraForTile(12, 0, 0, 256).zoom, 11);
  assert.equal(cameraForTile(12, 0, 0, 256).width, 256);
  assert.equal(cameraForTile(12, 0, 0, 512).zoom, 12);
  assert.equal(cameraForTile(12, 0, 0, 512).width, 512);
});

test('z0 256px tile renders at 512 and asks for downscale', () => {
  const cam = cameraForTile(0, 0, 0, 256);
  assert.equal(cam.zoom, 0);
  assert.equal(cam.width, 512);
  assert.equal(cam.downscaleTo, 256);
});

test('style rewrite points sources and glyphs at local schemes', () => {
  const out = rewriteStyleForRenderer(
    { version: 8, sources: { omt: { type: 'vector', url: '/api/tiles.json' } }, glyphs: '/api/assets/fonts/{fontstack}/{range}.pbf', sprite: '/x', layers: [] },
    { minZoom: 0, maxZoom: 14, bounds: [0, 0, 1, 1] },
  );
  assert.deepEqual(out.sources.omt.tiles, ['pmtiles://{z}/{x}/{y}']);
  assert.equal(out.sources.omt.maxzoom, 14);
  assert.equal(out.glyphs, 'fonts://{fontstack}/{range}.pbf');
  assert.equal(out.sprite, undefined);
});

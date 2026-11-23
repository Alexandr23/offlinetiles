import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseArgs, flagBool, flagString, formatBytes, formatDuration } from './cli.ts';
import { glyphRanges } from './fonts.ts';
import { slugify } from './geofabrik.ts';
import { buildingManifest, datasetVersion, readManifest, writeManifest } from './manifest.ts';
import { expectedLayersForMaxZoom, OPENMAPTILES_LAYER_MIN_ZOOM } from './validate.ts';

test('parseArgs handles --k v, --k=v and bare flags', () => {
  const { flags, positional } = parseArgs(['--region', 'monaco', '--force', '--memory=4g', 'extra', '--planet']);
  assert.equal(flagString(flags, 'region'), 'monaco');
  assert.equal(flagBool(flags, 'force'), true);
  assert.equal(flagString(flags, 'memory'), '4g');
  assert.equal(flagBool(flags, 'planet'), true);
  assert.deepEqual(positional, ['extra']);
  assert.equal(flagString(flags, 'missing'), undefined);
});

test('slugify normalises region ids and URLs', () => {
  assert.equal(slugify('us/colorado'), 'us-colorado');
  assert.equal(slugify('Great Britain'), 'great-britain');
  assert.equal(slugify('andorra-latest.osm.pbf'), 'andorra');
});

test('glyph ranges cover the BMP exactly once', () => {
  const ranges = glyphRanges();
  assert.equal(ranges.length, 256);
  assert.equal(ranges[0], '0-255');
  assert.equal(ranges[255], '65280-65535');
});

test('manifest round-trips and versions differ per source', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'manifest-'));
  const file = path.join(dir, 'dataset.json');
  assert.equal(await readManifest(file), null);
  const m = buildingManifest({ type: 'region', region: 'monaco' }, 'master/master.pmtiles');
  await writeManifest(file, m);
  const back = await readManifest(file);
  assert.equal(back?.status, 'building');
  assert.deepEqual(back?.source, { type: 'region', region: 'monaco' });
  const v1 = datasetVersion({ type: 'region', region: 'monaco' }, 100);
  const v2 = datasetVersion({ type: 'region', region: 'andorra' }, 100);
  assert.notEqual(v1.slice(-8), v2.slice(-8));
  assert.match(v1, /^\d{8}T\d{6}Z-[0-9a-f]{8}$/);
  await fsp.rm(dir, { recursive: true, force: true });
});

test('formatters', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatDuration(65_000), '1m 5s');
});

test('expected OpenMapTiles layers scale with archive maxZoom', () => {
  const z3 = expectedLayersForMaxZoom(3);
  assert.ok(z3.includes('water'));
  assert.ok(z3.includes('place'));
  assert.ok(z3.includes('waterway'));
  assert.ok(!z3.includes('transportation'), 'roads are not expected until z4');
  assert.ok(!z3.includes('building'));

  const z4 = expectedLayersForMaxZoom(4);
  assert.ok(z4.includes('transportation'));
  assert.ok(!z4.includes('building'));

  const z14 = expectedLayersForMaxZoom(14);
  assert.deepEqual(z14, Object.keys(OPENMAPTILES_LAYER_MIN_ZOOM).sort());
  assert.ok(z14.includes('building'));
  assert.ok(z14.includes('housenumber'));
});

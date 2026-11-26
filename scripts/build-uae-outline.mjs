// Extracts the UAE boundary from the Natural Earth country index into a small file for the landing hero.
// Usage: node scripts/build-uae-outline.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = new URL('../apps/web/public/data/countries.json', import.meta.url);
const out = new URL('../apps/web/public/landing/uae-outline.json', import.meta.url);

const uae = JSON.parse(readFileSync(src, 'utf8')).countries.find((c) => c.id === 'AE');
if (!uae) throw new Error('AE not found');

const round = (ring) => ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
const polygons = uae.geometry.type === 'Polygon' ? [uae.geometry.coordinates] : uae.geometry.coordinates;
const rings = polygons.flatMap((p) => p.map(round)).sort((a, b) => b.length - a.length);
const [main, ...rest] = rings;

writeFileSync(
  out,
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'fill' }, geometry: { type: 'MultiPolygon', coordinates: polygons.map((p) => p.map(round)) } },
      { type: 'Feature', properties: { kind: 'main' }, geometry: { type: 'LineString', coordinates: main } },
      { type: 'Feature', properties: { kind: 'rest' }, geometry: { type: 'MultiLineString', coordinates: rest } },
    ],
  }),
);
console.log('main', main.length, 'rest', rest.length);

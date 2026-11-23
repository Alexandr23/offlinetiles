/**
 * Build apps/web/public/data/countries.json from Natural Earth admin-0 GeoJSON.
 *
 * Default source: ne_10m_admin_0_countries (public domain).
 *
 *   pnpm build-countries
 *   pnpm build-countries -- --input /path/to/ne_10m_admin_0_countries.geojson
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const OUT = path.join(ROOT, 'apps/web/public/data/countries.json');

/** Soft cap per country — keeps 10m coast detail without pathological rings. */
const MAX_VERTS = 12_000;
/** Schema limit in packages/contracts (MultiPolygon parts). */
const MAX_PARTS = 256;
const MAX_RINGS = 64;

type Position = [number, number];
type PolygonCoords = Position[][];
type Geometry =
  | { type: 'Polygon'; coordinates: PolygonCoords }
  | { type: 'MultiPolygon'; coordinates: PolygonCoords[] };

interface CountryRecord {
  id: string;
  name: string;
  aliases: string[];
  geometry: Geometry;
}

function roundCoord(c: number[]): Position {
  return [Math.round(c[0]! * 1e5) / 1e5, Math.round(c[1]! * 1e5) / 1e5];
}

function sqSegDist(p: Position, a: Position, b: Position): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 4 || tolerance <= 0) return ring.map((c) => [c[0], c[1]] as Position);

  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;

  const douglas = (first: number, last: number) => {
    let maxSq = 0;
    let index = -1;
    const a = ring[first]!;
    const b = ring[last]!;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(ring[i]!, a, b);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (maxSq > sqTol && index !== -1) {
      keep[index] = 1;
      douglas(first, index);
      douglas(index, last);
    }
  };
  douglas(0, ring.length - 1);

  const out: Position[] = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push([ring[i]![0], ring[i]![1]]);
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out.length >= 4 ? out : ring.map((c) => [c[0], c[1]] as Position);
}

function ringAreaAbs(ring: Position[]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  }
  return Math.abs(a / 2);
}

function processPolygon(coords: number[][][], tol: number): PolygonCoords | null {
  const rings: Position[][] = [];
  for (const ring of coords) {
    const rounded = ring.map(roundCoord);
    const simplified = tol > 0 ? simplifyRing(rounded, tol) : rounded;
    const f = simplified[0];
    const l = simplified[simplified.length - 1];
    if (f && l && (f[0] !== l[0] || f[1] !== l[1])) simplified.push([f[0], f[1]]);
    if (simplified.length >= 4) rings.push(simplified);
  }
  if (!rings.length) return null;
  if (rings.length > MAX_RINGS) {
    const outer = rings[0]!;
    const holes = rings
      .slice(1)
      .sort((a, b) => ringAreaAbs(b) - ringAreaAbs(a))
      .slice(0, MAX_RINGS - 1);
    return [outer, ...holes];
  }
  return rings;
}

function countVerts(g: Geometry): number {
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(1);
  return rings.reduce((n, r) => n + Math.max(0, r.length - 1), 0);
}

function processGeometry(geom: { type: string; coordinates: unknown }, tol: number): Geometry | null {
  if (geom.type === 'Polygon') {
    const p = processPolygon(geom.coordinates as number[][][], tol);
    return p ? { type: 'Polygon', coordinates: p } : null;
  }
  if (geom.type === 'MultiPolygon') {
    const parts: { coords: PolygonCoords; area: number }[] = [];
    for (const poly of geom.coordinates as number[][][][]) {
      const p = processPolygon(poly, tol);
      if (p) parts.push({ coords: p, area: ringAreaAbs(p[0] ?? []) });
    }
    parts.sort((a, b) => b.area - a.area);
    const kept = parts.slice(0, MAX_PARTS).map((p) => p.coords);
    if (!kept.length) return null;
    if (kept.length === 1) return { type: 'Polygon', coordinates: kept[0]! };
    return { type: 'MultiPolygon', coordinates: kept };
  }
  return null;
}

function parseArgs(argv: string[]) {
  let input: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') input = argv[++i];
  }
  return { input };
}

interface RawFeature {
  type: string;
  properties?: Record<string, unknown> | null;
  geometry?: { type: string; coordinates: unknown } | null;
}

interface RawCollection {
  type: string;
  features: RawFeature[];
}

async function loadRaw(input?: string): Promise<{ source: string; geojson: RawCollection }> {
  if (input) {
    const text = await readFile(input, 'utf8');
    const base = path.basename(input).replace(/\.geojson$/i, '');
    return { source: base, geojson: JSON.parse(text) as RawCollection };
  }

  const cache = path.join(ROOT, 'scripts/data/ne_10m_admin_0_countries.geojson');
  try {
    const text = await readFile(cache, 'utf8');
    console.log(`Using cached ${cache}`);
    return { source: 'ne_10m_admin_0_countries', geojson: JSON.parse(text) as RawCollection };
  } catch {
    // fall through to download
  }

  console.log(`Downloading ${DEFAULT_URL}`);
  const res = await fetch(DEFAULT_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, text);
  return { source: 'ne_10m_admin_0_countries', geojson: JSON.parse(text) as RawCollection };
}

async function main() {
  const { input } = parseArgs(process.argv.slice(2));
  const { source, geojson } = await loadRaw(input);

  const countries: CountryRecord[] = [];
  for (const f of geojson.features) {
    const p = f.properties ?? {};
    const name = String(p.NAME_EN || p.NAME || p.ADMIN || '').trim();
    if (!name || !f.geometry) continue;

    const isoA2Eh = typeof p.ISO_A2_EH === 'string' ? p.ISO_A2_EH : '';
    const isoA2 = typeof p.ISO_A2 === 'string' ? p.ISO_A2 : '';
    const isoA3 = typeof p.ISO_A3 === 'string' ? p.ISO_A3 : '';
    const iso =
      (isoA2Eh && isoA2Eh !== '-99' ? isoA2Eh : null) ||
      (isoA2 && isoA2 !== '-99' ? isoA2 : null) ||
      (isoA3 && isoA3 !== '-99' ? isoA3 : null) ||
      name;

    const aliases = [
      ...new Set(
        [p.ADMIN, p.NAME, p.NAME_LONG, p.NAME_SORT, p.BRK_NAME, p.NAME_ALT, p.NAME_CIAWF, p.NAME_FR, p.NAME_ES, p.NAME_DE, p.NAME_RU, p.NAME_ZH, p.SOVEREIGNT]
          .filter((x): x is string => typeof x === 'string' && !!x && x !== name)
          .slice(0, 12),
      ),
    ];

    let geom = processGeometry(f.geometry as { type: string; coordinates: unknown }, 0);
    if (!geom) continue;

    let verts = countVerts(geom);
    let tol = 0.0008;
    while (verts > MAX_VERTS && tol < 0.15) {
      geom = processGeometry(f.geometry as { type: string; coordinates: unknown }, tol);
      if (!geom) break;
      verts = countVerts(geom);
      tol *= 1.45;
    }
    if (!geom) continue;

    countries.push({ id: String(iso), name, aliases, geometry: geom });
  }

  countries.sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    type: 'CountryIndex' as const,
    version: 3,
    source,
    countries,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify(out);
  await writeFile(OUT, json);

  const vs = countries.map((c) => countVerts(c.geometry)).sort((a, b) => a - b);
  const sampleNames = ['United Arab Emirates', 'Norway', 'United Kingdom', 'Greece', 'Chile', 'France'];
  const samples = Object.fromEntries(
    sampleNames.map((n) => {
      const c = countries.find((x) => x.name === n);
      if (!c) return [n, null];
      return [
        n,
        {
          verts: countVerts(c.geometry),
          parts: c.geometry.type === 'MultiPolygon' ? c.geometry.coordinates.length : 1,
        },
      ];
    }),
  );

  console.log(
    JSON.stringify(
      {
        out: OUT,
        count: countries.length,
        bytes: json.length,
        maxVerts: vs.at(-1),
        medianVerts: vs[vs.length >> 1],
        p90Verts: vs[Math.floor(vs.length * 0.9)],
        samples,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

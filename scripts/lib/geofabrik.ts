/**
 * Region → OSM extract URL resolution.
 *
 * Uses the official Geofabrik index so every region they publish works
 * (`monaco`, `germany`, `us/california`, `europe/france/alsace`, …). Accepts:
 *   - a Geofabrik id            → monaco, great-britain, us/colorado
 *   - a Geofabrik path          → europe/monaco
 *   - a direct http(s) URL      → used as-is
 *   - "planet"                  → planet.openstreetmap.org
 */
import path from 'node:path';
import { CliError } from './cli.ts';
import { fetchJsonCached } from './download.ts';

export const PLANET_URL = 'https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf';
const INDEX_URL = 'https://download.geofabrik.de/index-v1-nogeom.json';
const INDEX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface GeofabrikFeature {
  properties: {
    id: string;
    name: string;
    parent?: string;
    urls: { pbf?: string };
  };
}

export interface ResolvedRegion {
  /** Normalised identifier used for file names, e.g. `monaco`, `us-colorado`. */
  id: string;
  name: string;
  url: string;
  /** Local file name under data/source. */
  fileName: string;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/-latest\.osm\.pbf$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function resolveRegion(input: string, cacheDir: string): Promise<ResolvedRegion> {
  const trimmed = input.trim();
  if (!trimmed) throw new CliError('region must not be empty');

  if (trimmed === 'planet') {
    return { id: 'planet', name: 'Planet', url: PLANET_URL, fileName: 'planet-latest.osm.pbf' };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    if (!/\.osm\.pbf$/i.test(trimmed)) throw new CliError('direct URLs must point at an .osm.pbf file');
    const id = slugify(path.basename(trimmed));
    return { id, name: id, url: trimmed, fileName: `${id}.osm.pbf` };
  }

  const index = await fetchJsonCached<{ features: GeofabrikFeature[] }>(
    INDEX_URL,
    path.join(cacheDir, 'geofabrik-index.json'),
    INDEX_MAX_AGE_MS,
  );
  const wanted = trimmed.toLowerCase().replace(/^\/+|\/+$/g, '');
  const match =
    index.features.find((f) => f.properties.id.toLowerCase() === wanted) ??
    index.features.find((f) => geofabrikPath(f, index.features).toLowerCase() === wanted) ??
    index.features.find((f) => f.properties.name.toLowerCase() === wanted) ??
    index.features.find((f) => slugify(f.properties.name) === slugify(wanted));

  if (!match) {
    const suggestions = index.features
      .filter((f) => f.properties.id.includes(wanted) || f.properties.name.toLowerCase().includes(wanted))
      .slice(0, 8)
      .map((f) => `  ${f.properties.id.padEnd(28)} ${f.properties.name}`);
    throw new CliError(
      `unknown region "${trimmed}". ${suggestions.length ? `Did you mean:\n${suggestions.join('\n')}` : 'See https://download.geofabrik.de/ for available regions.'}`,
    );
  }
  const url = match.properties.urls.pbf;
  if (!url) throw new CliError(`region "${match.properties.id}" has no .osm.pbf download`);
  const id = slugify(match.properties.id);
  return { id, name: match.properties.name, url, fileName: `${id}-latest.osm.pbf` };
}

function geofabrikPath(f: GeofabrikFeature, all: GeofabrikFeature[]): string {
  const parts = [f.properties.id];
  let parent = f.properties.parent;
  let guard = 0;
  while (parent && guard++ < 6) {
    parts.unshift(parent);
    const p = all.find((x) => x.properties.id === parent);
    parent = p?.properties.parent;
  }
  return parts.join('/');
}

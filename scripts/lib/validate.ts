/**
 * Sanity-checks a freshly built PMTiles archive before it is promoted to
 * master.pmtiles: readable header, vector tile type, OpenMapTiles layers
 * appropriate for the archive's zoom range, and at least one tile near the center.
 *
 * Structural problems throw. Missing layers that are not expected until a higher
 * zoom (e.g. `transportation` below z4) only produce warnings.
 */
import fsp from 'node:fs/promises';
import { PMTiles, TileType } from 'pmtiles';
import { FsSource } from '../../apps/server/src/modules/dataset/pmtiles-fs-source.ts';
import { CliError } from './cli.ts';

export interface ArchiveSummary {
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number];
  center: [number, number, number];
  layers: string[];
  /** Soft issues (zoom-appropriate layers missing, etc.); never blocks promotion. */
  warnings: string[];
  sizeBytes: number;
}

/**
 * OpenMapTiles / Planetiler profile: earliest zoom a layer normally appears in
 * `vector_layers` metadata. Tuned from the schema + observed z0–3 planet builds
 * (no `transportation` until z4).
 */
export const OPENMAPTILES_LAYER_MIN_ZOOM: Readonly<Record<string, number>> = {
  water: 0,
  water_name: 0,
  landcover: 0,
  boundary: 0,
  place: 0,
  waterway: 3,
  transportation: 4,
  landuse: 4,
  park: 4,
  transportation_name: 6,
  mountain_peak: 7,
  aerodrome_label: 8,
  aeroway: 10,
  poi: 12,
  building: 13,
  housenumber: 14,
};

/** Layers expected in `vector_layers` when the archive's maxZoom is at least their min zoom. */
export function expectedLayersForMaxZoom(maxZoom: number): string[] {
  return Object.entries(OPENMAPTILES_LAYER_MIN_ZOOM)
    .filter(([, minZ]) => minZ <= maxZoom)
    .map(([id]) => id)
    .sort();
}

export async function validatePmtiles(file: string): Promise<ArchiveSummary> {
  const source = new FsSource(file);
  const warnings: string[] = [];
  try {
    const archive = new PMTiles(source);
    const header = await archive.getHeader();
    if (header.tileType !== TileType.Mvt) {
      throw new CliError(`${file} does not contain vector tiles (tileType=${header.tileType})`);
    }
    if (header.maxZoom < header.minZoom) throw new CliError(`${file} has an invalid zoom range`);

    const metadata = (await archive.getMetadata()) as { vector_layers?: Array<{ id: string }> };
    const layers = (metadata.vector_layers ?? []).map((l) => l.id);
    if (layers.length === 0) throw new CliError(`${file} has no vector_layers metadata`);

    const expected = expectedLayersForMaxZoom(header.maxZoom);
    const missing = expected.filter((id) => !layers.includes(id));
    if (missing.length > 0) {
      warnings.push(
        `z${header.minZoom}–${header.maxZoom}: missing OpenMapTiles layer(s) expected by z${header.maxZoom}: ${missing.join(', ')} ` +
          `(present: ${layers.join(', ') || '(none)'})`,
      );
    }
    const unexpectedEarly = layers.filter((id) => {
      const minZ = OPENMAPTILES_LAYER_MIN_ZOOM[id];
      return minZ !== undefined && minZ > header.maxZoom;
    });
    if (unexpectedEarly.length > 0) {
      // Unusual but not fatal — schema drift or Planetiler still emitting empty layer stubs.
      warnings.push(
        `z${header.maxZoom}: archive lists layer(s) normally introduced later: ${unexpectedEarly.join(', ')}`,
      );
    }

    // Probe a tile at the center; empty regions can legitimately miss tiles, so try a few zooms.
    let found = false;
    for (let z = Math.min(header.centerZoom, header.maxZoom); z >= header.minZoom && !found; z--) {
      const { x, y } = lonLatToTile(header.centerLon, header.centerLat, z);
      const tile = await archive.getZxy(z, x, y);
      found = !!tile && tile.data.byteLength > 0;
    }
    if (!found) throw new CliError(`${file} has no tiles around its declared center`);

    const sizeBytes = (await fsp.stat(file)).size;
    return {
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      center: [header.centerLon, header.centerLat, header.centerZoom],
      layers,
      warnings,
      sizeBytes,
    };
  } finally {
    await source.close();
  }
}

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

import fs from 'node:fs/promises';
import { Compression, PMTiles, type Header } from 'pmtiles';
import {
  DatasetManifestSchema,
  type DatasetInfo,
  type DatasetManifest,
  type DatasetVectorLayer,
} from '@map-exporter/contracts';
import type { AppConfig } from '../../config/config.js';
import type { Logger } from '../../shared/logging/logger.js';
import { FsSource } from './pmtiles-fs-source.js';

interface OpenDataset {
  manifest: DatasetManifest;
  pmtiles: PMTiles;
  source: FsSource;
  header: Header;
  metadata: Record<string, unknown>;
  sizeBytes: number;
}

const COMPRESSION_NAMES: Record<number, string> = {
  [Compression.Unknown]: 'unknown',
  [Compression.None]: 'none',
  [Compression.Gzip]: 'gzip',
  [Compression.Brotli]: 'brotli',
  [Compression.Zstd]: 'zstd',
};

/** How often a not-ready dataset is re-checked on disk (init-map may be running). */
const RECHECK_INTERVAL_MS = 2000;

/**
 * Owns access to the master dataset (`master.pmtiles` + `dataset.json`).
 *
 * The open archive is treated as immutable, but the *manifest* is watched:
 * while the dataset is missing/building, every info request (throttled)
 * re-reads it, and when `init-map` promotes a new master the service swaps
 * to it, so the app never needs a restart after initialization.
 */
export class DatasetService {
  private open: OpenDataset | null = null;
  private notReady: Extract<DatasetInfo, { ready: false }> | null = null;
  private loading: Promise<void> | null = null;
  private manifestMtimeMs: number | null = null;
  private lastCheckAt = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    if (!this.loading) this.loading = this.doLoad().finally(() => (this.loading = null));
    return this.loading;
  }

  /**
   * Re-read the manifest when it changed on disk, or periodically while not
   * ready. Cheap (one stat) and safe to call on every `/api/dataset` request.
   */
  async refresh(): Promise<void> {
    const now = Date.now();
    if (this.loading) return this.loading;
    if (this.open && now - this.lastCheckAt < RECHECK_INTERVAL_MS) return;
    if (!this.open && now - this.lastCheckAt < RECHECK_INTERVAL_MS) return;
    this.lastCheckAt = now;
    let mtimeMs: number | null = null;
    try {
      mtimeMs = (await fs.stat(this.config.datasetManifest)).mtimeMs;
    } catch {
      mtimeMs = null;
    }
    const changed = mtimeMs !== this.manifestMtimeMs;
    if (changed || !this.open) await this.load();
  }

  private async doLoad(): Promise<void> {
    const { datasetManifest, masterPmtiles } = this.config;
    this.lastCheckAt = Date.now();
    let manifestRaw: string;
    try {
      const [raw, stat] = await Promise.all([fs.readFile(datasetManifest, 'utf8'), fs.stat(datasetManifest)]);
      manifestRaw = raw;
      this.manifestMtimeMs = stat.mtimeMs;
    } catch {
      this.manifestMtimeMs = null;
      await this.setNotReady({
        ready: false,
        reason: 'missing',
        message: `dataset.json not found at ${datasetManifest}. Run \`pnpm init-map --region <region>\`.`,
      });
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(manifestRaw);
    } catch (err) {
      await this.setNotReady({ ready: false, reason: 'invalid', message: `dataset.json is not valid JSON: ${(err as Error).message}` });
      return;
    }
    const parsed = DatasetManifestSchema.safeParse(json);
    if (!parsed.success) {
      await this.setNotReady({ ready: false, reason: 'invalid', message: `dataset.json is invalid: ${parsed.error.message}` });
      return;
    }
    const manifest = parsed.data;
    if (manifest.status === 'building') {
      await this.setNotReady({ ready: false, reason: 'building', message: 'Dataset initialization is in progress.' });
      return;
    }
    if (manifest.status === 'failed') {
      await this.setNotReady({
        ready: false,
        reason: 'failed',
        message: `Dataset initialization failed: ${manifest.error ?? 'unknown error'}`,
      });
      return;
    }
    // Same ready dataset already open → nothing to do.
    if (this.open && this.open.manifest.version === manifest.version) return;

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(masterPmtiles);
    } catch {
      await this.setNotReady({ ready: false, reason: 'missing', message: `master.pmtiles not found at ${masterPmtiles}` });
      return;
    }

    const source = new FsSource(masterPmtiles);
    const pmtiles = new PMTiles(source);
    try {
      const header = await pmtiles.getHeader();
      const metadata = ((await pmtiles.getMetadata()) ?? {}) as Record<string, unknown>;
      const previous = this.open;
      this.open = { manifest, pmtiles, source, header, metadata, sizeBytes: stat.size };
      this.notReady = null;
      await previous?.source.close();
      this.logger.info(
        {
          version: manifest.version,
          minZoom: header.minZoom,
          maxZoom: header.maxZoom,
          tiles: header.numAddressedTiles,
          sizeBytes: stat.size,
          replaced: previous !== null,
        },
        'master dataset ready',
      );
    } catch (err) {
      await source.close();
      await this.setNotReady({
        ready: false,
        reason: 'invalid',
        message: `master.pmtiles could not be read: ${(err as Error).message}`,
      });
    }
  }

  private async setNotReady(state: Extract<DatasetInfo, { ready: false }>): Promise<void> {
    const previous = this.open;
    this.open = null;
    this.notReady = state;
    if (previous) {
      this.logger.warn({ reason: state.reason }, 'master dataset is no longer available');
      await previous.source.close();
    }
  }

  isReady(): boolean {
    return this.open !== null;
  }

  requireOpen(): OpenDataset {
    if (!this.open) throw new Error('dataset not ready');
    return this.open;
  }

  get version(): string | null {
    return this.open?.manifest.version ?? null;
  }

  get maxZoom(): number | null {
    return this.open?.header.maxZoom ?? null;
  }

  get bounds(): [number, number, number, number] | null {
    const h = this.open?.header;
    return h ? [h.minLon, h.minLat, h.maxLon, h.maxLat] : null;
  }

  getInfo(): DatasetInfo {
    if (!this.open) {
      return this.notReady ?? { ready: false, reason: 'missing', message: 'dataset not loaded' };
    }
    const { manifest, header, metadata, sizeBytes } = this.open;
    const vectorLayers = Array.isArray(metadata.vector_layers)
      ? (metadata.vector_layers as DatasetVectorLayer[])
      : [];
    const sourceLabel =
      manifest.source.type === 'region'
        ? manifest.source.region
        : manifest.source.type === 'planet'
          ? 'planet'
          : manifest.source.path.split('/').pop() ?? 'file';
    return {
      ready: true,
      version: manifest.version,
      source: sourceLabel,
      sourceDetail: manifest.source,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      center: [header.centerLon, header.centerLat, header.centerZoom],
      tileCompression: COMPRESSION_NAMES[header.tileCompression] ?? 'unknown',
      vectorLayers,
      tileUrlTemplate: '/api/tiles/{z}/{x}/{y}.pbf',
      glyphsUrlTemplate: '/api/assets/fonts/{fontstack}/{range}.pbf',
      createdAt: manifest.createdAt,
      sizeBytes,
    };
  }

  /** TileJSON for MapLibre vector source pointing at the tile endpoint. */
  getTileJson(baseUrl: string): Record<string, unknown> {
    const { header, metadata } = this.requireOpen();
    return {
      tilejson: '3.0.0',
      name: (metadata.name as string | undefined) ?? 'master',
      scheme: 'xyz',
      tiles: [`${baseUrl}/api/tiles/{z}/{x}/{y}.pbf`],
      vector_layers: metadata.vector_layers ?? [],
      attribution: (metadata.attribution as string | undefined) ?? '© OpenStreetMap contributors',
      minzoom: header.minZoom,
      maxzoom: header.maxZoom,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      center: [header.centerLon, header.centerLat, header.centerZoom],
    };
  }

  /** Returns raw (still compressed) tile bytes plus its content encoding, or null when absent. */
  async getTile(z: number, x: number, y: number): Promise<{ data: Uint8Array; encoding: string | null } | null> {
    const { pmtiles, header } = this.requireOpen();
    if (z < header.minZoom || z > header.maxZoom) return null;
    const max = 2 ** z;
    if (x < 0 || y < 0 || x >= max || y >= max) return null;
    // pmtiles decompresses for us; we re-serve plain protobuf.
    const result = await pmtiles.getZxy(z, x, y);
    if (!result) return null;
    return { data: new Uint8Array(result.data), encoding: null };
  }

  async close(): Promise<void> {
    await this.open?.source.close();
    this.open = null;
    this.loading = null;
    this.manifestMtimeMs = null;
  }
}

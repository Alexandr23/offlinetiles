import type { ArtifactManifest, MapLibreStyle } from '@map-exporter/contracts';

/**
 * Produces the `style.json` shipped next to `map.mbtiles`.
 *
 * The snapshot uses application-relative URLs (`/api/tiles.json`, `/api/assets/fonts/...`).
 * The exported copy makes those absolute so the bundle can be opened by the local
 * application, and records the MBTiles file it was generated for in `metadata`.
 */
export function buildExportStyle(
  snapshot: MapLibreStyle,
  options: { apiUrl: string; manifest: ArtifactManifest },
): MapLibreStyle {
  const absolutize = (url: string) => (url.startsWith('/') ? `${options.apiUrl.replace(/\/$/, '')}${url}` : url);

  const sources: MapLibreStyle['sources'] = {};
  for (const [id, source] of Object.entries(snapshot.sources)) {
    const copy: Record<string, unknown> = { ...source };
    if (typeof copy.url === 'string') copy.url = absolutize(copy.url);
    if (Array.isArray(copy.tiles)) copy.tiles = copy.tiles.map((t) => (typeof t === 'string' ? absolutize(t) : t));
    sources[id] = copy;
  }

  return {
    ...snapshot,
    name: snapshot.name ?? options.manifest.styleName ?? options.manifest.name,
    sources,
    glyphs: snapshot.glyphs ? absolutize(snapshot.glyphs) : snapshot.glyphs,
    sprite: typeof snapshot.sprite === 'string' ? absolutize(snapshot.sprite) : snapshot.sprite,
    metadata: {
      ...(snapshot.metadata ?? {}),
      'map-exporter': {
        jobId: options.manifest.jobId,
        tiles: options.manifest.files.tiles,
        content: options.manifest.content,
        container: options.manifest.container,
        minZoom: options.manifest.minZoom,
        maxZoom: options.manifest.maxZoom,
        bounds: options.manifest.bounds,
      },
    },
  };
}

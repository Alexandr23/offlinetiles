/**
 * Rewrites an application style snapshot so every resource resolves locally:
 *   - vector sources            → pmtiles://{z}/{x}/{y}        (served from master.pmtiles)
 *   - glyphs                    → fonts://{fontstack}/{range}  (served from fontsDir)
 *   - sprite                    → removed (presets ship without sprites)
 * @param {Record<string, any>} style
 * @param {{ minZoom: number, maxZoom: number, bounds: number[] }} source
 */
export function rewriteStyleForRenderer(style, source) {
  /** @type {Record<string, any>} */
  const sources = {};
  for (const [id, src] of Object.entries(style.sources ?? {})) {
    if (src.type === 'vector') {
      sources[id] = {
        type: 'vector',
        tiles: ['pmtiles://{z}/{x}/{y}'],
        minzoom: source.minZoom,
        maxzoom: source.maxZoom,
        bounds: source.bounds,
      };
    } else {
      sources[id] = src;
    }
  }
  /** @type {Record<string, any>} */
  const next = {
    ...style,
    sources,
    glyphs: 'fonts://{fontstack}/{range}.pbf',
  };
  delete next.sprite;
  return next;
}

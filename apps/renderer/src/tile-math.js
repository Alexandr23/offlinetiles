/**
 * Tile ↔ geography helpers for the renderer. Kept dependency-free and tested.
 */

/** Longitude/latitude of the center of XYZ tile z/x/y. */
export function tileCenter(z, x, y) {
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
  return [lon, (latRad * 180) / Math.PI];
}

/**
 * Camera parameters that make a `tileSize`-pixel image cover exactly XYZ tile z/x/y.
 * MapLibre's zoom scale assumes 512px world tiles, so 256px tiles render at z-1.
 * At z=0 a 256px tile would need zoom -1 (invalid): we render 512px and let the
 * caller downscale.
 */
export function cameraForTile(z, x, y, tileSize) {
  const [lon, lat] = tileCenter(z, x, y);
  if (tileSize === 512) {
    return { zoom: z, center: [lon, lat], width: 512, height: 512, downscaleTo: null };
  }
  if (z === 0) {
    return { zoom: 0, center: [lon, lat], width: 512, height: 512, downscaleTo: 256 };
  }
  return { zoom: z - 1, center: [lon, lat], width: 256, height: 256, downscaleTo: null };
}

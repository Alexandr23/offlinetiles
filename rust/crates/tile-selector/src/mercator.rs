//! Web Mercator (EPSG:3857) helpers expressed in *normalized* tile space.
//!
//! Normalized space maps the whole world to the unit square `[0,1] x [0,1]`
//! with `(0,0)` at the north-west corner. At zoom `z` the tile `(x, y)` covers
//! exactly `[x / 2^z, (x+1) / 2^z] x [y / 2^z, (y+1) / 2^z]`, which lets the
//! selector compare polygons against tiles without any trigonometry in the hot
//! loop. Because the projection is monotone in each axis, rectangles in
//! lon/lat map to rectangles in normalized space and vice versa.

use std::f64::consts::PI;

/// Maximum latitude representable in Web Mercator.
pub const MAX_LATITUDE: f64 = 85.051_128_779_806_59;

/// Clamp a latitude into the Web Mercator domain.
#[inline]
pub fn clamp_latitude(lat: f64) -> f64 {
    lat.clamp(-MAX_LATITUDE, MAX_LATITUDE)
}

/// Wrap a longitude into `[-180, 180]`.
#[inline]
pub fn clamp_longitude(lon: f64) -> f64 {
    lon.clamp(-180.0, 180.0)
}

/// Project a lon/lat pair to normalized Web Mercator space.
#[inline]
pub fn lon_lat_to_norm(lon: f64, lat: f64) -> (f64, f64) {
    let lon = clamp_longitude(lon);
    let lat = clamp_latitude(lat).to_radians();
    let x = (lon + 180.0) / 360.0;
    let y = (1.0 - (lat.tan() + 1.0 / lat.cos()).ln() / PI) / 2.0;
    (x, y.clamp(0.0, 1.0))
}

/// Inverse of [`lon_lat_to_norm`].
#[inline]
pub fn norm_to_lon_lat(x: f64, y: f64) -> (f64, f64) {
    let lon = x * 360.0 - 180.0;
    let n = PI - 2.0 * PI * y;
    let lat = (0.5 * (n.exp() - (-n).exp())).atan().to_degrees();
    (lon, lat)
}

/// Number of tiles along one axis at zoom `z`.
#[inline]
pub fn tiles_per_axis(z: u8) -> u64 {
    1u64 << z
}

/// Convert a lon/lat position to fractional tile coordinates at zoom `z`.
#[inline]
pub fn lon_lat_to_tile_f64(lon: f64, lat: f64, z: u8) -> (f64, f64) {
    let (x, y) = lon_lat_to_norm(lon, lat);
    let n = tiles_per_axis(z) as f64;
    (x * n, y * n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() <= eps
    }

    #[test]
    fn origin_maps_to_center() {
        let (x, y) = lon_lat_to_norm(0.0, 0.0);
        assert!(close(x, 0.5, 1e-12));
        assert!(close(y, 0.5, 1e-12));
    }

    #[test]
    fn corners_map_to_unit_square() {
        let (x, y) = lon_lat_to_norm(-180.0, MAX_LATITUDE);
        assert!(close(x, 0.0, 1e-12));
        assert!(close(y, 0.0, 1e-9));
        let (x, y) = lon_lat_to_norm(180.0, -MAX_LATITUDE);
        assert!(close(x, 1.0, 1e-12));
        assert!(close(y, 1.0, 1e-9));
    }

    #[test]
    fn roundtrip() {
        for &(lon, lat) in &[(7.42, 43.73), (-122.4, 37.8), (151.2, -33.9), (0.0, 80.0)] {
            let (x, y) = lon_lat_to_norm(lon, lat);
            let (lon2, lat2) = norm_to_lon_lat(x, y);
            assert!(close(lon, lon2, 1e-9), "lon {lon} -> {lon2}");
            assert!(close(lat, lat2, 1e-9), "lat {lat} -> {lat2}");
        }
    }

    #[test]
    fn latitude_is_clamped() {
        let (_, y) = lon_lat_to_norm(0.0, 89.9);
        assert!(close(y, 0.0, 1e-9));
    }

    #[test]
    fn known_tiles() {
        // London (-0.1278, 51.5074) at z10 is the well-known tile 511/340.
        let (x, y) = lon_lat_to_tile_f64(-0.1278, 51.5074, 10);
        assert_eq!(x.floor() as u64, 511);
        assert_eq!(y.floor() as u64, 340);
        // Monaco (7.4246, 43.7384) at z14 is tile 8529/5974.
        let (x, y) = lon_lat_to_tile_f64(7.4246, 43.7384, 14);
        assert_eq!(x.floor() as u64, 8529);
        assert_eq!(y.floor() as u64, 5974);
    }
}

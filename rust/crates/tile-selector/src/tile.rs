//! XYZ tile coordinates and their bounds.
//!
//! All coordinates in this crate follow the XYZ ("slippy map") convention where
//! `y = 0` is the northern-most row. TMS conversion is deliberately *not*
//! implemented here; it lives in the MBTiles writer, the only component whose
//! storage format requires it.

use serde::{Deserialize, Serialize};

use crate::mercator::{norm_to_lon_lat, tiles_per_axis};

/// A tile address in XYZ convention.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TileCoord {
    pub z: u8,
    pub x: u32,
    pub y: u32,
}

impl TileCoord {
    pub const fn new(z: u8, x: u32, y: u32) -> Self {
        Self { z, x, y }
    }

    /// Validate that `x` and `y` are inside the grid for `z`.
    pub fn is_valid(&self) -> bool {
        self.z <= 30 && (self.x as u64) < tiles_per_axis(self.z) && (self.y as u64) < tiles_per_axis(self.z)
    }

    /// The parent tile one zoom level up (identity for `z == 0`).
    pub fn parent(&self) -> TileCoord {
        if self.z == 0 {
            *self
        } else {
            TileCoord::new(self.z - 1, self.x / 2, self.y / 2)
        }
    }

    /// The four children at `z + 1`, in row-major order (NW, NE, SW, SE).
    pub fn children(&self) -> [TileCoord; 4] {
        let z = self.z + 1;
        let x = self.x * 2;
        let y = self.y * 2;
        [
            TileCoord::new(z, x, y),
            TileCoord::new(z, x + 1, y),
            TileCoord::new(z, x, y + 1),
            TileCoord::new(z, x + 1, y + 1),
        ]
    }

    /// Bounds of this tile in normalized Web Mercator space.
    pub fn norm_bounds(&self) -> NormBounds {
        let n = tiles_per_axis(self.z) as f64;
        NormBounds {
            min_x: self.x as f64 / n,
            min_y: self.y as f64 / n,
            max_x: (self.x as f64 + 1.0) / n,
            max_y: (self.y as f64 + 1.0) / n,
        }
    }

    /// Geographic bounds of this tile `[west, south, east, north]`.
    pub fn lon_lat_bounds(&self) -> [f64; 4] {
        let b = self.norm_bounds();
        let (west, north) = norm_to_lon_lat(b.min_x, b.min_y);
        let (east, south) = norm_to_lon_lat(b.max_x, b.max_y);
        [west, south, east, north]
    }
}

impl std::fmt::Display for TileCoord {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}/{}/{}", self.z, self.x, self.y)
    }
}

/// An axis-aligned rectangle in normalized Web Mercator space.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NormBounds {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl NormBounds {
    pub const WORLD: NormBounds = NormBounds { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 };

    #[inline]
    pub fn intersects(&self, other: &NormBounds) -> bool {
        self.min_x <= other.max_x && self.max_x >= other.min_x && self.min_y <= other.max_y && self.max_y >= other.min_y
    }

    #[inline]
    pub fn contains_bounds(&self, other: &NormBounds) -> bool {
        self.min_x <= other.min_x && self.max_x >= other.max_x && self.min_y <= other.min_y && self.max_y >= other.max_y
    }

    #[inline]
    pub fn center(&self) -> (f64, f64) {
        ((self.min_x + self.max_x) / 2.0, (self.min_y + self.max_y) / 2.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn children_and_parent_roundtrip() {
        let t = TileCoord::new(3, 5, 2);
        for child in t.children() {
            assert_eq!(child.parent(), t);
            assert!(child.is_valid());
        }
    }

    #[test]
    fn root_bounds_are_world() {
        assert_eq!(TileCoord::new(0, 0, 0).norm_bounds(), NormBounds::WORLD);
        let [w, s, e, n] = TileCoord::new(0, 0, 0).lon_lat_bounds();
        assert!((w + 180.0).abs() < 1e-9);
        assert!((e - 180.0).abs() < 1e-9);
        assert!(n > 85.0 && s < -85.0);
    }

    #[test]
    fn validity() {
        assert!(TileCoord::new(1, 1, 1).is_valid());
        assert!(!TileCoord::new(1, 2, 0).is_valid());
        assert!(!TileCoord::new(0, 0, 1).is_valid());
    }

    #[test]
    fn display() {
        assert_eq!(TileCoord::new(14, 8532, 5980).to_string(), "14/8532/5980");
    }
}

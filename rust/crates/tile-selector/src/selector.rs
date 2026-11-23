//! Quadtree tile selection.
//!
//! Starting from the root tile, each node is classified against the selection
//! area. Disjoint subtrees are pruned, fully contained subtrees are counted
//! arithmetically (or enumerated lazily), and only tiles straddling the
//! boundary descend child-by-child. Cost is therefore proportional to the
//! *perimeter* of the selection at the maximum zoom, not its area.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::geometry::{Relation, SelectionArea};
use crate::tile::TileCoord;

/// Highest zoom this crate will enumerate. `2^30` tiles per axis keeps `u32`
/// coordinates safe; practical exports never approach this.
pub const MAX_SUPPORTED_ZOOM: u8 = 30;

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum SelectionError {
    #[error("minZoom ({min}) must not exceed maxZoom ({max})")]
    InvalidZoomRange { min: u8, max: u8 },
    #[error("maxZoom ({0}) exceeds the supported maximum ({MAX_SUPPORTED_ZOOM})")]
    ZoomTooHigh(u8),
    #[error("selection produces {count} tiles, exceeding the limit of {limit}")]
    LimitExceeded { count: u64, limit: u64 },
}

/// Inclusive zoom range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ZoomRange {
    pub min: u8,
    pub max: u8,
}

impl ZoomRange {
    pub fn new(min: u8, max: u8) -> Result<Self, SelectionError> {
        if min > max {
            return Err(SelectionError::InvalidZoomRange { min, max });
        }
        if max > MAX_SUPPORTED_ZOOM {
            return Err(SelectionError::ZoomTooHigh(max));
        }
        Ok(Self { min, max })
    }

    pub fn iter(&self) -> impl Iterator<Item = u8> {
        self.min..=self.max
    }
}

/// Tile counts per zoom level and in total.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TileCounts {
    pub total: u64,
    /// `(zoom, count)` pairs for every zoom in the requested range.
    pub per_zoom: Vec<(u8, u64)>,
}

impl TileCounts {
    fn new(range: ZoomRange) -> Self {
        Self { total: 0, per_zoom: range.iter().map(|z| (z, 0)).collect() }
    }

    fn add(&mut self, z: u8, n: u64) {
        self.total += n;
        if let Some(entry) = self.per_zoom.iter_mut().find(|(zz, _)| *zz == z) {
            entry.1 += n;
        }
    }
}

/// Number of tiles a fully contained node at `node_zoom` contributes at `zoom`.
#[inline]
fn subtree_size(node_zoom: u8, zoom: u8) -> u64 {
    1u64 << (2 * (zoom - node_zoom) as u32)
}

/// Count selected tiles without enumerating them.
pub fn count_tiles(area: &SelectionArea, range: ZoomRange) -> TileCounts {
    let mut counts = TileCounts::new(range);
    let mut stack = vec![TileCoord::new(0, 0, 0)];
    while let Some(tile) = stack.pop() {
        match area.classify(&tile.norm_bounds()) {
            Relation::Disjoint => {}
            Relation::Contained => {
                for z in range.min.max(tile.z)..=range.max {
                    counts.add(z, subtree_size(tile.z, z));
                }
            }
            Relation::Partial => {
                if tile.z >= range.min {
                    counts.add(tile.z, 1);
                }
                if tile.z < range.max {
                    stack.extend(tile.children());
                }
            }
        }
    }
    counts
}

/// Lazy iterator over all selected tiles in `range`.
///
/// Tiles are yielded in depth-first quadtree order, which keeps spatially
/// adjacent tiles close together (good for source locality) and requires only
/// `O(maxZoom)` memory regardless of how many tiles are selected.
pub struct TileIter<'a> {
    area: &'a SelectionArea,
    range: ZoomRange,
    stack: Vec<TileCoord>,
    contained: Option<ContainedIter>,
}

impl<'a> TileIter<'a> {
    pub fn new(area: &'a SelectionArea, range: ZoomRange) -> Self {
        Self { area, range, stack: vec![TileCoord::new(0, 0, 0)], contained: None }
    }
}

impl Iterator for TileIter<'_> {
    type Item = TileCoord;

    fn next(&mut self) -> Option<TileCoord> {
        loop {
            if let Some(inner) = &mut self.contained {
                if let Some(t) = inner.next() {
                    return Some(t);
                }
                self.contained = None;
            }
            let tile = self.stack.pop()?;
            match self.area.classify(&tile.norm_bounds()) {
                Relation::Disjoint => {}
                Relation::Contained => {
                    self.contained = Some(ContainedIter::new(tile, self.range));
                }
                Relation::Partial => {
                    if tile.z < self.range.max {
                        // Push in reverse so NW child pops first.
                        let children = tile.children();
                        for child in children.iter().rev() {
                            self.stack.push(*child);
                        }
                    }
                    if tile.z >= self.range.min {
                        return Some(tile);
                    }
                }
            }
        }
    }
}

/// Enumerates every descendant of a contained node within the zoom range.
struct ContainedIter {
    base: TileCoord,
    range: ZoomRange,
    z: u8,
    dx: u32,
    dy: u32,
    done: bool,
}

impl ContainedIter {
    fn new(base: TileCoord, range: ZoomRange) -> Self {
        let z = range.min.max(base.z);
        Self { base, range, z, dx: 0, dy: 0, done: z > range.max }
    }
}

impl Iterator for ContainedIter {
    type Item = TileCoord;

    fn next(&mut self) -> Option<TileCoord> {
        if self.done {
            return None;
        }
        let span = 1u32 << (self.z - self.base.z);
        let tile = TileCoord::new(self.z, self.base.x * span + self.dx, self.base.y * span + self.dy);
        // Advance row-major within the current zoom, then step zoom.
        self.dx += 1;
        if self.dx >= span {
            self.dx = 0;
            self.dy += 1;
            if self.dy >= span {
                self.dy = 0;
                if self.z >= self.range.max {
                    self.done = true;
                } else {
                    self.z += 1;
                }
            }
        }
        Some(tile)
    }
}

/// Materialize the selection, failing early if it would exceed `limit`.
pub fn select_tiles(
    area: &SelectionArea,
    range: ZoomRange,
    limit: Option<u64>,
) -> Result<Vec<TileCoord>, SelectionError> {
    if let Some(limit) = limit {
        let counts = count_tiles(area, range);
        if counts.total > limit {
            return Err(SelectionError::LimitExceeded { count: counts.total, limit });
        }
    }
    Ok(TileIter::new(area, range).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn bbox(w: f64, s: f64, e: f64, n: f64) -> SelectionArea {
        SelectionArea::from_bbox(w, s, e, n).unwrap()
    }

    #[test]
    fn zoom_range_validation() {
        assert!(ZoomRange::new(5, 3).is_err());
        assert!(ZoomRange::new(0, 31).is_err());
        assert!(ZoomRange::new(0, 0).is_ok());
    }

    #[test]
    fn whole_world_counts_are_powers_of_four() {
        let world = bbox(-180.0, -85.0511, 180.0, 85.0511);
        let counts = count_tiles(&world, ZoomRange::new(0, 5).unwrap());
        assert_eq!(counts.per_zoom, vec![(0, 1), (1, 4), (2, 16), (3, 64), (4, 256), (5, 1024)]);
        assert_eq!(counts.total, 1 + 4 + 16 + 64 + 256 + 1024);
    }

    #[test]
    fn iterator_matches_count_and_is_unique() {
        let area = bbox(7.38, 43.70, 7.46, 43.78); // Monaco-ish
        for (min, max) in [(0, 0), (0, 8), (10, 14), (12, 16)] {
            let range = ZoomRange::new(min, max).unwrap();
            let counts = count_tiles(&area, range);
            let tiles: Vec<TileCoord> = TileIter::new(&area, range).collect();
            assert_eq!(tiles.len() as u64, counts.total, "range {min}-{max}");
            let unique: HashSet<_> = tiles.iter().copied().collect();
            assert_eq!(unique.len(), tiles.len(), "duplicates in {min}-{max}");
            for t in &tiles {
                assert!(t.is_valid());
                assert!(t.z >= min && t.z <= max);
            }
            for z in min..=max {
                let n = tiles.iter().filter(|t| t.z == z).count() as u64;
                assert_eq!(counts.per_zoom.iter().find(|(zz, _)| *zz == z).unwrap().1, n);
            }
        }
    }

    #[test]
    fn brute_force_agreement_at_low_zoom() {
        // Compare the quadtree against a naive per-tile classification.
        let area = bbox(-30.0, 10.0, 40.0, 60.0);
        let range = ZoomRange::new(0, 7).unwrap();
        let fast: HashSet<_> = TileIter::new(&area, range).collect();
        let mut slow = HashSet::new();
        for z in 0..=7u8 {
            let n = 1u32 << z;
            for x in 0..n {
                for y in 0..n {
                    let t = TileCoord::new(z, x, y);
                    if area.classify(&t.norm_bounds()) != Relation::Disjoint {
                        slow.insert(t);
                    }
                }
            }
        }
        assert_eq!(fast, slow);
    }

    #[test]
    fn contained_tile_at_high_zoom_includes_monaco() {
        let area = bbox(7.38, 43.70, 7.46, 43.78);
        let tiles: HashSet<_> = TileIter::new(&area, ZoomRange::new(14, 14).unwrap()).collect();
        assert!(tiles.contains(&TileCoord::new(14, 8529, 5974)));
    }

    #[test]
    fn limit_is_enforced() {
        let world = bbox(-180.0, -85.0511, 180.0, 85.0511);
        let err = select_tiles(&world, ZoomRange::new(0, 10).unwrap(), Some(1000)).unwrap_err();
        assert!(matches!(err, SelectionError::LimitExceeded { .. }));
        assert!(select_tiles(&world, ZoomRange::new(0, 2).unwrap(), Some(1000)).is_ok());
    }

    #[test]
    fn polygon_selection_excludes_far_corner() {
        // Triangle covering the SW half of a square; the NE corner tile must be excluded.
        let poly = serde_json::json!({"type":"Polygon","coordinates":[[[0,0],[40,0],[0,40],[0,0]]]});
        let area = SelectionArea::from_geojson_value(&poly).unwrap();
        let range = ZoomRange::new(6, 6).unwrap();
        let tiles: HashSet<_> = TileIter::new(&area, range).collect();
        let ne = {
            let (x, y) = crate::mercator::lon_lat_to_tile_f64(38.0, 38.0, 6);
            TileCoord::new(6, x as u32, y as u32)
        };
        let sw = {
            let (x, y) = crate::mercator::lon_lat_to_tile_f64(5.0, 5.0, 6);
            TileCoord::new(6, x as u32, y as u32)
        };
        assert!(!tiles.contains(&ne));
        assert!(tiles.contains(&sw));
    }
}

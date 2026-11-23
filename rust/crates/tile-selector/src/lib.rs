//! Tile selection for the Local Map Tile Exporter.
//!
//! Given a GeoJSON `Polygon`/`MultiPolygon` and an inclusive zoom range, this
//! crate determines which XYZ tiles intersect the selection. It exposes:
//!
//! * [`mercator`] — Web Mercator projection helpers in normalized tile space.
//! * [`TileCoord`] — XYZ tile addresses and bounds.
//! * [`SelectionArea`] — a projected selection that can classify rectangles.
//! * [`count_tiles`] / [`TileIter`] / [`select_tiles`] — quadtree selection.
//!
//! The same code path powers both estimates (counting) and generation
//! (enumeration), so the two can never disagree.

pub mod geometry;
pub mod mercator;
pub mod selector;
pub mod tile;

pub use geometry::{GeometryError, Relation, SelectionArea};
pub use selector::{count_tiles, select_tiles, SelectionError, TileCounts, TileIter, ZoomRange, MAX_SUPPORTED_ZOOM};
pub use tile::{NormBounds, TileCoord};

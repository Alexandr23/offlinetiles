//! Selection geometry: a GeoJSON `Polygon` or `MultiPolygon` projected into
//! normalized Web Mercator space, ready for tile classification.

use geo::{BoundingRect, Contains, Coord, Intersects, LineString, MultiPolygon, Polygon, Rect};
use geojson::Position;
use thiserror::Error;

use crate::mercator::lon_lat_to_norm;
use crate::tile::NormBounds;

#[derive(Debug, Error)]
pub enum GeometryError {
    #[error("invalid GeoJSON geometry: {0}")]
    InvalidGeoJson(String),
    #[error("selection geometry must be a Polygon or MultiPolygon, got {0}")]
    UnsupportedType(String),
    #[error("selection geometry is empty")]
    Empty,
    #[error("polygon ring needs at least 4 positions (closed ring), got {0}")]
    DegenerateRing(usize),
}

/// How a tile relates to the selection area.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Relation {
    /// No overlap at all; the whole subtree can be skipped.
    Disjoint,
    /// Fully inside the selection; the whole subtree is selected.
    Contained,
    /// Overlaps the boundary; children must be examined individually.
    Partial,
}

/// A selection area in normalized Web Mercator space.
#[derive(Debug, Clone)]
pub struct SelectionArea {
    polygons: MultiPolygon<f64>,
    bounds: NormBounds,
}

impl SelectionArea {
    /// Build a selection from a GeoJSON geometry value (already parsed JSON).
    pub fn from_geojson_value(value: &serde_json::Value) -> Result<Self, GeometryError> {
        let geometry: geojson::Geometry =
            serde_json::from_value(value.clone()).map_err(|e| GeometryError::InvalidGeoJson(e.to_string()))?;
        Self::from_geojson(&geometry)
    }

    /// Build a selection from a parsed GeoJSON geometry.
    pub fn from_geojson(geometry: &geojson::Geometry) -> Result<Self, GeometryError> {
        let polygons: Vec<Polygon<f64>> = match &geometry.value {
            geojson::GeometryValue::Polygon { coordinates } => vec![project_polygon(coordinates)?],
            geojson::GeometryValue::MultiPolygon { coordinates } => {
                coordinates.iter().map(|rings| project_polygon(rings)).collect::<Result<Vec<_>, _>>()?
            }
            other => return Err(GeometryError::UnsupportedType(other.type_name().to_string())),
        };
        if polygons.is_empty() {
            return Err(GeometryError::Empty);
        }
        Self::from_norm_polygons(MultiPolygon::new(polygons))
    }

    /// Build a selection from a geographic bounding box `[west, south, east, north]`.
    pub fn from_bbox(west: f64, south: f64, east: f64, north: f64) -> Result<Self, GeometryError> {
        let ring: Vec<Position> = vec![
            Position::from([west, south]),
            Position::from([east, south]),
            Position::from([east, north]),
            Position::from([west, north]),
            Position::from([west, south]),
        ];
        let poly = project_polygon(&[ring])?;
        Self::from_norm_polygons(MultiPolygon::new(vec![poly]))
    }

    fn from_norm_polygons(polygons: MultiPolygon<f64>) -> Result<Self, GeometryError> {
        let rect = polygons.bounding_rect().ok_or(GeometryError::Empty)?;
        let bounds = NormBounds {
            min_x: rect.min().x.clamp(0.0, 1.0),
            min_y: rect.min().y.clamp(0.0, 1.0),
            max_x: rect.max().x.clamp(0.0, 1.0),
            max_y: rect.max().y.clamp(0.0, 1.0),
        };
        if bounds.max_x <= bounds.min_x || bounds.max_y <= bounds.min_y {
            return Err(GeometryError::Empty);
        }
        Ok(Self { polygons, bounds })
    }

    /// Bounding box of the selection in normalized space.
    pub fn bounds(&self) -> NormBounds {
        self.bounds
    }

    /// Point-in-polygon test in normalized Web Mercator space.
    ///
    /// Used by the raster clipper to zero alpha outside the selection. Holes
    /// are respected (`geo`'s even-odd / interior ring semantics).
    #[inline]
    pub fn contains_norm(&self, x: f64, y: f64) -> bool {
        self.polygons.contains(&Coord { x, y })
    }

    /// Classify an axis-aligned rectangle against the selection.
    ///
    /// The algorithm avoids general polygon/polygon predicates: if no ring edge
    /// crosses the rectangle, the rectangle is either entirely inside one
    /// polygon, entirely outside, or entirely surrounds a polygon — which is
    /// resolved with cheap point-in-polygon and point-in-rect tests.
    pub fn classify(&self, b: &NormBounds) -> Relation {
        if !self.bounds.intersects(b) {
            return Relation::Disjoint;
        }
        let rect = Rect::new(Coord { x: b.min_x, y: b.min_y }, Coord { x: b.max_x, y: b.max_y });
        let (cx, cy) = b.center();
        let center = Coord { x: cx, y: cy };

        let mut any_partial = false;
        for poly in &self.polygons {
            if ring_crosses(poly.exterior(), &rect) || poly.interiors().iter().any(|r| ring_crosses(r, &rect)) {
                any_partial = true;
                continue;
            }
            // No edge crosses the rectangle.
            if poly.contains(&center) {
                return Relation::Contained;
            }
            // Polygon may sit entirely inside the rectangle.
            if let Some(first) = poly.exterior().0.first() {
                if rect.contains(first) || rect.intersects(first) {
                    any_partial = true;
                }
            }
        }
        if any_partial {
            Relation::Partial
        } else {
            Relation::Disjoint
        }
    }
}

#[inline]
fn ring_crosses(ring: &LineString<f64>, rect: &Rect<f64>) -> bool {
    ring.intersects(rect)
}

fn project_polygon(rings: &[Vec<Position>]) -> Result<Polygon<f64>, GeometryError> {
    let mut iter = rings.iter();
    let exterior = iter.next().ok_or(GeometryError::Empty)?;
    let exterior = project_ring(exterior)?;
    let interiors = iter.map(|r| project_ring(r)).collect::<Result<Vec<_>, _>>()?;
    Ok(Polygon::new(exterior, interiors))
}

fn project_ring(ring: &[Position]) -> Result<LineString<f64>, GeometryError> {
    if ring.len() < 4 {
        return Err(GeometryError::DegenerateRing(ring.len()));
    }
    let mut coords = Vec::with_capacity(ring.len());
    for pos in ring {
        let (lon, lat) = match pos.as_slice() {
            [lon, lat, ..] => (*lon, *lat),
            _ => return Err(GeometryError::InvalidGeoJson("position needs at least two coordinates".into())),
        };
        if !lon.is_finite() || !lat.is_finite() {
            return Err(GeometryError::InvalidGeoJson("non-finite coordinate".into()));
        }
        let (x, y) = lon_lat_to_norm(lon, lat);
        coords.push(Coord { x, y });
    }
    let mut ls = LineString::new(coords);
    ls.close();
    Ok(ls)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn square(west: f64, south: f64, east: f64, north: f64) -> SelectionArea {
        SelectionArea::from_bbox(west, south, east, north).unwrap()
    }

    #[test]
    fn parses_polygon_and_multipolygon() {
        let poly = json!({"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]});
        assert!(SelectionArea::from_geojson_value(&poly).is_ok());
        let multi = json!({"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,1],[0,0]]],[[[5,5],[6,5],[6,6],[5,6],[5,5]]]]});
        assert!(SelectionArea::from_geojson_value(&multi).is_ok());
    }

    #[test]
    fn rejects_other_geometry_types() {
        let pt = json!({"type":"Point","coordinates":[0,0]});
        assert!(matches!(SelectionArea::from_geojson_value(&pt), Err(GeometryError::UnsupportedType(_))));
        let bad = json!({"type":"Polygon","coordinates":[[[0,0],[1,1]]]});
        assert!(matches!(SelectionArea::from_geojson_value(&bad), Err(GeometryError::DegenerateRing(_))));
    }

    #[test]
    fn classifies_world_against_small_area() {
        let area = square(7.40, 43.72, 7.44, 43.76);
        assert_eq!(area.classify(&NormBounds::WORLD), Relation::Partial);
    }

    #[test]
    fn classifies_disjoint_contained_partial() {
        let area = square(-10.0, -10.0, 10.0, 10.0);
        let (ax, ay) = lon_lat_to_norm(-5.0, -5.0);
        let (bx, by) = lon_lat_to_norm(5.0, 5.0);
        let inside = NormBounds { min_x: ax, min_y: by, max_x: bx, max_y: ay };
        assert_eq!(area.classify(&inside), Relation::Contained);

        let (ax, ay) = lon_lat_to_norm(50.0, 50.0);
        let (bx, by) = lon_lat_to_norm(60.0, 60.0);
        let far = NormBounds { min_x: ax, min_y: by, max_x: bx, max_y: ay };
        assert_eq!(area.classify(&far), Relation::Disjoint);

        let (ax, ay) = lon_lat_to_norm(5.0, 5.0);
        let (bx, by) = lon_lat_to_norm(15.0, 15.0);
        let edge = NormBounds { min_x: ax, min_y: by, max_x: bx, max_y: ay };
        assert_eq!(area.classify(&edge), Relation::Partial);
    }

    #[test]
    fn hole_is_respected() {
        let poly = json!({"type":"Polygon","coordinates":[
            [[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]],
            [[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]
        ]});
        let area = SelectionArea::from_geojson_value(&poly).unwrap();
        let (ax, ay) = lon_lat_to_norm(-1.0, -1.0);
        let (bx, by) = lon_lat_to_norm(1.0, 1.0);
        let in_hole = NormBounds { min_x: ax, min_y: by, max_x: bx, max_y: ay };
        assert_eq!(area.classify(&in_hole), Relation::Disjoint);
        assert!(!area.contains_norm((ax + bx) / 2.0, (ay + by) / 2.0));
        let (ox, oy) = lon_lat_to_norm(5.0, 5.0);
        assert!(area.contains_norm(ox, oy));
    }

    #[test]
    fn contains_norm_matches_bbox() {
        let area = square(-10.0, -10.0, 10.0, 10.0);
        let (ix, iy) = lon_lat_to_norm(0.0, 0.0);
        assert!(area.contains_norm(ix, iy));
        let (ox, oy) = lon_lat_to_norm(50.0, 50.0);
        assert!(!area.contains_norm(ox, oy));
    }
}

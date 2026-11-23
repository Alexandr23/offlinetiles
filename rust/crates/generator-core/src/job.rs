//! Pieces shared by the vector and raster jobs: resolving the selection and
//! building the MBTiles metadata block.

use mbtiles_writer::{MbtilesMetadata, TileFormat};
use tile_selector::mercator::norm_to_lon_lat;
use tile_selector::{count_tiles, SelectionArea, ZoomRange};

use crate::error::Result;
use crate::protocol::GenerateRequest;

pub const GENERATOR_NAME: &str = "tile-generator";
pub const GENERATOR_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Resolved selection: projected area, zoom range, geographic bbox and total tile count.
pub struct ResolvedSelection {
    pub area: SelectionArea,
    pub range: ZoomRange,
    /// `[west, south, east, north]`
    pub bounds: [f64; 4],
    pub total: u64,
}

pub fn resolve_selection(req: &GenerateRequest) -> Result<ResolvedSelection> {
    let area = SelectionArea::from_geojson_value(&req.selection.geometry)?;
    let range = ZoomRange::new(req.selection.min_zoom, req.selection.max_zoom)?;
    let nb = area.bounds();
    let (west, north) = norm_to_lon_lat(nb.min_x, nb.min_y);
    let (east, south) = norm_to_lon_lat(nb.max_x, nb.max_y);
    let total = count_tiles(&area, range).total;
    Ok(ResolvedSelection { area, range, bounds: [west, south, east, north], total })
}

pub fn build_metadata(
    req: &GenerateRequest,
    sel: &ResolvedSelection,
    format: TileFormat,
    vector_layers: Option<serde_json::Value>,
    source_attribution: Option<&str>,
) -> MbtilesMetadata {
    let m = &req.output.metadata;
    let attribution = m.attribution.clone().or_else(|| source_attribution.map(|s| s.to_string()));
    let center = ((sel.bounds[0] + sel.bounds[2]) / 2.0, (sel.bounds[1] + sel.bounds[3]) / 2.0, sel.range.min);
    let mut extra = vec![
        ("generator".to_string(), format!("{GENERATOR_NAME} {GENERATOR_VERSION}")),
        ("map_exporter_job_id".to_string(), req.job_id.clone()),
    ];
    if let Some(size) = req.output.tile_size.filter(|_| format == TileFormat::Png) {
        extra.push(("tile_size".to_string(), size.to_string()));
    }
    MbtilesMetadata {
        name: m.name.clone(),
        description: m.description.clone(),
        attribution,
        format,
        min_zoom: sel.range.min,
        max_zoom: sel.range.max,
        bounds: sel.bounds,
        center,
        vector_layers,
        extra,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> GenerateRequest {
        GenerateRequest::parse(
            r#"{"protocolVersion":1,"jobId":"j","source":{"type":"pmtiles","path":"/m"},
            "selection":{"geometry":{"type":"Polygon","coordinates":[[[7.4,43.7],[7.45,43.7],[7.45,43.75],[7.4,43.75],[7.4,43.7]]]},"minZoom":3,"maxZoom":9},
            "output":{"content":"vector","container":"mbtiles","path":"/o/map.mbtiles","metadata":{"name":"N"}},"style":null,"threads":1}"#,
        )
        .unwrap()
    }

    #[test]
    fn resolves_bounds_and_counts() {
        let r = req();
        let sel = resolve_selection(&r).unwrap();
        assert!((sel.bounds[0] - 7.4).abs() < 1e-9);
        assert!((sel.bounds[1] - 43.7).abs() < 1e-9);
        assert!((sel.bounds[2] - 7.45).abs() < 1e-9);
        assert!((sel.bounds[3] - 43.75).abs() < 1e-9);
        assert!(sel.total >= 7);
        let meta = build_metadata(&r, &sel, TileFormat::Pbf, None, Some("© OSM"));
        assert_eq!(meta.attribution.as_deref(), Some("© OSM"));
        assert_eq!(meta.center.2, 3);
        assert!(meta.extra.iter().any(|(k, _)| k == "generator"));
    }
}

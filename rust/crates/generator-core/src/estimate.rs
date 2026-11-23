//! Export estimates.
//!
//! Tile counts come from the exact same quadtree used for generation. Byte
//! sizes are measured by reading a bounded, evenly spaced sample of the
//! selected tiles from the source archive; the Node side turns the sample
//! into a size/time projection.

use std::collections::BTreeMap;
use std::sync::Arc;

use pmtiles_source::PmtilesSource;
use tile_selector::{count_tiles, SelectionArea, TileCoord, TileIter, ZoomRange};
use tokio::task::JoinSet;

use crate::error::{GeneratorError, Result};
use crate::protocol::{EstimateRequest, EstimateResult};

/// Maximum concurrent source reads while sampling.
const SAMPLE_CONCURRENCY: usize = 64;

pub async fn estimate(req: &EstimateRequest) -> Result<EstimateResult> {
    let area = SelectionArea::from_geojson_value(&req.selection.geometry)?;
    let range = ZoomRange::new(req.selection.min_zoom, req.selection.max_zoom)?;
    let counts = count_tiles(&area, range);
    let tiles_per_zoom: BTreeMap<String, u64> = counts.per_zoom.iter().map(|(z, n)| (z.to_string(), *n)).collect();

    let mut result = EstimateResult {
        tiles: counts.total,
        tiles_per_zoom,
        sampled_tiles: 0,
        sampled_bytes: 0,
        sampled_present: 0,
        exact: false,
    };
    if req.sample_limit == 0 || counts.total == 0 {
        return Ok(result);
    }

    let source = Arc::new(PmtilesSource::open_vector(req.source.path()).await?);
    let sample = pick_sample(&area, range, counts.total, req.sample_limit);
    result.exact = sample.len() as u64 == counts.total;

    let mut set = JoinSet::new();
    let mut pending = sample.into_iter();
    let mut in_flight = 0usize;
    loop {
        while in_flight < SAMPLE_CONCURRENCY {
            match pending.next() {
                Some(tile) => {
                    let src = source.clone();
                    set.spawn(async move { src.get_tile_raw(tile).await.map(|b| b.map(|b| b.len() as u64)) });
                    in_flight += 1;
                }
                None => break,
            }
        }
        match set.join_next().await {
            None => break,
            Some(joined) => {
                in_flight -= 1;
                let size = joined.map_err(|e| GeneratorError::Internal(format!("sample task failed: {e}")))??;
                result.sampled_tiles += 1;
                if let Some(bytes) = size {
                    result.sampled_present += 1;
                    result.sampled_bytes += bytes;
                }
            }
        }
    }
    Ok(result)
}

/// Evenly spaced sample across the whole enumeration (so every zoom level is
/// represented roughly in proportion to its tile count).
fn pick_sample(area: &SelectionArea, range: ZoomRange, total: u64, limit: u64) -> Vec<TileCoord> {
    if total <= limit {
        return TileIter::new(area, range).collect();
    }
    let stride = total / limit;
    let mut out = Vec::with_capacity(limit as usize);
    for (i, tile) in TileIter::new(area, range).enumerate() {
        if (i as u64) % stride == 0 {
            out.push(tile);
            if out.len() as u64 >= limit {
                break;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{SelectionSpec, SourceSpec, PROTOCOL_VERSION};
    use pmtiles_source::fixture::{write_fixture, FixtureOptions};

    fn request(path: &str, min: u8, max: u8, sample_limit: u64) -> EstimateRequest {
        EstimateRequest {
            protocol_version: PROTOCOL_VERSION,
            source: SourceSpec::Pmtiles { path: path.into() },
            selection: SelectionSpec {
                geometry: serde_json::json!({"type":"Polygon","coordinates":[[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]]]}),
                min_zoom: min,
                max_zoom: max,
            },
            sample_limit,
        }
    }

    #[tokio::test]
    async fn counts_without_sampling_do_not_touch_source() {
        let r = estimate(&request("/nope.pmtiles", 0, 3, 0)).await.unwrap();
        assert_eq!(r.tiles, r.tiles_per_zoom.values().sum::<u64>());
        assert_eq!(r.sampled_tiles, 0);
        assert!(!r.exact);
    }

    #[tokio::test]
    async fn exact_and_sampled_sizes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fx.pmtiles");
        write_fixture(&path, &FixtureOptions { min_zoom: 0, max_zoom: 5, ..Default::default() }).unwrap();
        let p = path.to_string_lossy().to_string();

        let exact = estimate(&request(&p, 0, 4, 10_000)).await.unwrap();
        assert!(exact.exact);
        assert_eq!(exact.sampled_tiles, exact.tiles);
        assert_eq!(exact.sampled_present, exact.tiles);
        assert!(exact.sampled_bytes > 0);

        let sampled = estimate(&request(&p, 0, 5, 10)).await.unwrap();
        assert!(!sampled.exact);
        assert_eq!(sampled.sampled_tiles, 10);
        assert!(sampled.sampled_bytes > 0);

        // Zoom beyond the archive → tiles counted but none present.
        let beyond = estimate(&request(&p, 7, 7, 5)).await.unwrap();
        assert_eq!(beyond.sampled_present, 0);
        assert!(beyond.tiles > 0);
    }

    #[test]
    fn sample_is_evenly_spaced_and_bounded() {
        let area = SelectionArea::from_bbox(-180.0, -85.0, 180.0, 85.0).unwrap();
        let range = ZoomRange::new(0, 6).unwrap();
        let total = count_tiles(&area, range).total;
        let s = pick_sample(&area, range, total, 100);
        assert_eq!(s.len(), 100);
        assert!(s.iter().any(|t| t.z == 6));
        assert!(s.first().unwrap().z == 0);
    }
}

//! Synthetic PMTiles archives for tests, benchmarks and end-to-end runs.
//!
//! The generated archive holds *valid* (if visually boring) Mapbox Vector
//! Tiles: every tile contains a single `water` polygon covering the whole tile
//! plus a `place` point in the middle, so MapLibre can render it and the
//! vector pipeline exercises real decompression/recompression paths.

use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use pmtiles::{PmTilesWriter, TileType};
use tile_selector::{count_tiles, SelectionArea, TileIter, ZoomRange};

use crate::{Result, SourceError};

/// Options for [`write_fixture`].
#[derive(Debug, Clone)]
pub struct FixtureOptions {
    pub min_zoom: u8,
    pub max_zoom: u8,
    /// `[west, south, east, north]`
    pub bounds: [f64; 4],
    pub name: String,
}

impl Default for FixtureOptions {
    fn default() -> Self {
        Self { min_zoom: 0, max_zoom: 6, bounds: [-180.0, -85.0511, 180.0, 85.0511], name: "fixture".into() }
    }
}

/// Write an archive covering `bounds` at every zoom in range. Returns the number of tiles written.
pub fn write_fixture(path: &Path, opts: &FixtureOptions) -> Result<u64> {
    let area = SelectionArea::from_bbox(opts.bounds[0], opts.bounds[1], opts.bounds[2], opts.bounds[3])
        .map_err(|e| SourceError::Io(std::io::Error::other(e.to_string())))?;
    let range = ZoomRange::new(opts.min_zoom, opts.max_zoom)
        .map_err(|e| SourceError::Io(std::io::Error::other(e.to_string())))?;
    let total = count_tiles(&area, range).total;

    let metadata = serde_json::json!({
        "name": opts.name,
        "format": "pbf",
        "attribution": "fixture",
        "vector_layers": [
            { "id": "water", "fields": {} },
            { "id": "place", "fields": { "name": "String" } }
        ]
    });
    let file = BufWriter::new(File::create(path)?);
    let mut writer = PmTilesWriter::new(TileType::Mvt)
        .min_zoom(opts.min_zoom)
        .max_zoom(opts.max_zoom)
        .bounds(opts.bounds[0], opts.bounds[1], opts.bounds[2], opts.bounds[3])
        .center((opts.bounds[0] + opts.bounds[2]) / 2.0, (opts.bounds[1] + opts.bounds[3]) / 2.0)
        .center_zoom(opts.min_zoom)
        .metadata(&metadata.to_string())
        .create(file)?;

    // PMTiles wants increasing tile ids for best layout; sort by (z, hilbert) is
    // handled internally, we just feed tiles zoom by zoom.
    let mut tiles: Vec<_> = TileIter::new(&area, range).collect();
    tiles.sort();
    for t in tiles {
        let coord = pmtiles::TileCoord::new(t.z, t.x, t.y).map_err(|_| SourceError::InvalidCoord(t))?;
        writer.add_tile(coord, &mvt_tile(t.z, t.x, t.y))?;
    }
    writer.finalize()?;
    Ok(total)
}

// --- Minimal MVT encoder -------------------------------------------------------------------
//
// Enough protobuf to emit two layers. Spec: https://github.com/mapbox/vector-tile-spec/tree/master/2.1

fn varint(mut v: u64, out: &mut Vec<u8>) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

fn key(field: u32, wire: u8, out: &mut Vec<u8>) {
    varint(((field as u64) << 3) | wire as u64, out);
}

fn bytes_field(field: u32, data: &[u8], out: &mut Vec<u8>) {
    key(field, 2, out);
    varint(data.len() as u64, out);
    out.extend_from_slice(data);
}

fn zigzag(v: i64) -> u64 {
    ((v << 1) ^ (v >> 63)) as u64
}

fn command(id: u64, count: u64) -> u64 {
    (id & 0x7) | (count << 3)
}

fn packed_u32(field: u32, values: &[u64], out: &mut Vec<u8>) {
    let mut buf = Vec::new();
    for v in values {
        varint(*v, &mut buf);
    }
    bytes_field(field, &buf, out);
}

fn feature(id: u64, geom_type: u64, geometry: &[u64], tags: &[u64]) -> Vec<u8> {
    let mut f = Vec::new();
    key(1, 0, &mut f);
    varint(id, &mut f);
    if !tags.is_empty() {
        packed_u32(2, tags, &mut f);
    }
    key(3, 0, &mut f);
    varint(geom_type, &mut f);
    packed_u32(4, geometry, &mut f);
    f
}

fn layer(name: &str, features: &[Vec<u8>], keys: &[&str], values: &[&str]) -> Vec<u8> {
    let mut l = Vec::new();
    key(15, 0, &mut l);
    varint(2, &mut l); // version
    bytes_field(1, name.as_bytes(), &mut l);
    for f in features {
        bytes_field(2, f, &mut l);
    }
    for k in keys {
        bytes_field(3, k.as_bytes(), &mut l);
    }
    for v in values {
        let mut val = Vec::new();
        bytes_field(1, v.as_bytes(), &mut val); // string_value
        bytes_field(4, &val, &mut l);
    }
    key(5, 0, &mut l);
    varint(4096, &mut l); // extent
    l
}

/// A tile with a full-extent `water` polygon and a centred `place` point.
pub fn mvt_tile(z: u8, x: u32, y: u32) -> Vec<u8> {
    const EXTENT: i64 = 4096;
    // Polygon: MoveTo(0,0) LineTo(E,0) LineTo(E,E) LineTo(0,E) ClosePath
    let poly = feature(
        1,
        3,
        &[
            command(1, 1),
            zigzag(0),
            zigzag(0),
            command(2, 3),
            zigzag(EXTENT),
            zigzag(0),
            zigzag(0),
            zigzag(EXTENT),
            zigzag(-EXTENT),
            zigzag(0),
            command(7, 1),
        ],
        &[],
    );
    let point = feature(1, 1, &[command(1, 1), zigzag(EXTENT / 2), zigzag(EXTENT / 2)], &[0, 0]);
    let name = format!("{z}/{x}/{y}");
    let mut tile = Vec::new();
    bytes_field(3, &layer("water", &[poly], &[], &[]), &mut tile);
    bytes_field(3, &layer("place", &[point], &["name"], &[&name]), &mut tile);
    tile
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PmtilesSource;
    use tile_selector::TileCoord;

    #[tokio::test]
    async fn fixture_is_readable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fx.pmtiles");
        let n = write_fixture(&path, &FixtureOptions { min_zoom: 0, max_zoom: 3, ..Default::default() }).unwrap();
        assert_eq!(n, 1 + 4 + 16 + 64);
        let src = PmtilesSource::open_vector(&path).await.unwrap();
        assert_eq!(src.info().max_zoom, 3);
        let t = src.get_tile_decompressed(TileCoord::new(3, 7, 7)).await.unwrap().unwrap();
        assert_eq!(&t[..], &mvt_tile(3, 7, 7)[..]);
        assert!(src.get_tile_raw(TileCoord::new(4, 0, 0)).await.unwrap().is_none());
    }
}

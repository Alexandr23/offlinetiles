//! Read-only access to the master PMTiles archive.
//!
//! The archive is memory-mapped and its directories are cached, so random
//! access from many concurrent readers is cheap. Vector tiles are returned in
//! the form MBTiles expects (gzip or uncompressed MVT); if the archive uses a
//! compression MBTiles readers do not understand (brotli/zstd), tiles are
//! transparently re-encoded as gzip.

use std::io::Write;
use std::path::{Path, PathBuf};

use bytes::Bytes;
use pmtiles::{AsyncPmTilesReader, Compression, HashMapCache, MmapBackend, PmtError, TileType};
use thiserror::Error;
use tile_selector::TileCoord;

#[cfg(feature = "fixture")]
pub mod fixture;

#[derive(Debug, Error)]
pub enum SourceError {
    #[error("failed to open PMTiles archive {path}: {source}")]
    Open { path: PathBuf, source: PmtError },
    #[error("PMTiles read error: {0}")]
    Read(#[from] PmtError),
    #[error("archive metadata is not valid JSON: {0}")]
    Metadata(#[from] serde_json::Error),
    #[error("archive tile type {0:?} is not a vector tile archive")]
    NotVector(TileType),
    #[error("invalid tile coordinate {0}")]
    InvalidCoord(TileCoord),
    #[error("gzip error: {0}")]
    Gzip(std::io::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl std::fmt::Debug for PmtilesSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PmtilesSource").field("info", &self.info).finish_non_exhaustive()
    }
}

pub type Result<T> = std::result::Result<T, SourceError>;

/// Summary of the archive header and metadata.
#[derive(Debug, Clone)]
pub struct SourceInfo {
    pub path: PathBuf,
    pub min_zoom: u8,
    pub max_zoom: u8,
    /// `[west, south, east, north]`
    pub bounds: [f64; 4],
    /// `(lon, lat, zoom)`
    pub center: (f64, f64, u8),
    pub tile_compression: Compression,
    pub tile_type: TileType,
    /// Parsed `metadata` JSON (TileJSON-like, includes `vector_layers`).
    pub metadata: serde_json::Value,
}

impl SourceInfo {
    /// `vector_layers` array from the archive metadata, if present.
    pub fn vector_layers(&self) -> Option<&serde_json::Value> {
        self.metadata.get("vector_layers").filter(|v| v.is_array())
    }

    pub fn attribution(&self) -> Option<&str> {
        self.metadata.get("attribution").and_then(|v| v.as_str())
    }
}

/// A memory-mapped, directory-cached PMTiles reader.
pub struct PmtilesSource {
    reader: AsyncPmTilesReader<MmapBackend, HashMapCache>,
    info: SourceInfo,
}

impl PmtilesSource {
    /// Open an archive. Fails if the file is missing, malformed, or not MVT.
    pub async fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let backend =
            MmapBackend::try_from(&path).await.map_err(|source| SourceError::Open { path: path.clone(), source })?;
        let reader = AsyncPmTilesReader::try_from_cached_source(backend, HashMapCache::default())
            .await
            .map_err(|source| SourceError::Open { path: path.clone(), source })?;
        let header = reader.get_header();
        let metadata_str = reader.get_metadata().await?;
        let metadata: serde_json::Value =
            if metadata_str.trim().is_empty() { serde_json::json!({}) } else { serde_json::from_str(&metadata_str)? };

        let info = SourceInfo {
            path,
            min_zoom: header.min_zoom,
            max_zoom: header.max_zoom,
            bounds: [header.min_longitude, header.min_latitude, header.max_longitude, header.max_latitude],
            center: (header.center_longitude, header.center_latitude, header.center_zoom),
            tile_compression: header.tile_compression,
            tile_type: header.tile_type,
            metadata,
        };
        Ok(Self { reader, info })
    }

    /// Open and additionally assert the archive holds vector tiles.
    pub async fn open_vector(path: impl AsRef<Path>) -> Result<Self> {
        let src = Self::open(path).await?;
        match src.info.tile_type {
            TileType::Mvt => Ok(src),
            other => Err(SourceError::NotVector(other)),
        }
    }

    pub fn info(&self) -> &SourceInfo {
        &self.info
    }

    /// Raw tile bytes exactly as stored (still compressed with
    /// `info().tile_compression`). `None` when the tile does not exist.
    pub async fn get_tile_raw(&self, tile: TileCoord) -> Result<Option<Bytes>> {
        let coord = pmtiles::TileCoord::new(tile.z, tile.x, tile.y).map_err(|_| SourceError::InvalidCoord(tile))?;
        Ok(self.reader.get_tile(coord).await?)
    }

    /// Decompressed tile bytes. `None` when the tile does not exist.
    pub async fn get_tile_decompressed(&self, tile: TileCoord) -> Result<Option<Bytes>> {
        let coord = pmtiles::TileCoord::new(tile.z, tile.x, tile.y).map_err(|_| SourceError::InvalidCoord(tile))?;
        Ok(self.reader.get_tile_decompressed(coord).await?)
    }

    /// Tile bytes in a form suitable for direct insertion into MBTiles:
    /// gzip or uncompressed are passed through untouched; anything else is
    /// decompressed and re-encoded as gzip.
    pub async fn get_tile_for_mbtiles(&self, tile: TileCoord) -> Result<Option<Bytes>> {
        match self.info.tile_compression {
            Compression::Gzip | Compression::None | Compression::Unknown => self.get_tile_raw(tile).await,
            _ => match self.get_tile_decompressed(tile).await? {
                None => Ok(None),
                Some(raw) => Ok(Some(gzip(&raw)?)),
            },
        }
    }
}

fn gzip(data: &[u8]) -> Result<Bytes> {
    let mut enc = flate2::write::GzEncoder::new(Vec::with_capacity(data.len() / 2), flate2::Compression::default());
    enc.write_all(data).map_err(SourceError::Gzip)?;
    Ok(Bytes::from(enc.finish().map_err(SourceError::Gzip)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pmtiles::PmTilesWriter;
    use std::fs::File;
    use std::io::BufWriter;

    fn write_fixture(path: &Path) {
        let file = BufWriter::new(File::create(path).unwrap());
        let mut w = PmTilesWriter::new(TileType::Mvt)
            .min_zoom(0)
            .max_zoom(2)
            .bounds(-10.0, -10.0, 10.0, 10.0)
            .center(0.0, 0.0)
            .center_zoom(1)
            .metadata(r#"{"name":"fixture","vector_layers":[{"id":"water","fields":{}}]}"#)
            .create(file)
            .unwrap();
        w.add_tile(pmtiles::TileCoord::new(0, 0, 0).unwrap(), b"tile-0-0-0").unwrap();
        w.add_tile(pmtiles::TileCoord::new(1, 0, 0).unwrap(), b"tile-1-0-0").unwrap();
        w.add_tile(pmtiles::TileCoord::new(2, 1, 1).unwrap(), b"tile-2-1-1").unwrap();
        w.finalize().unwrap();
    }

    #[tokio::test]
    async fn reads_header_metadata_and_tiles() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f.pmtiles");
        write_fixture(&path);

        let src = PmtilesSource::open_vector(&path).await.unwrap();
        let info = src.info();
        assert_eq!(info.min_zoom, 0);
        assert_eq!(info.max_zoom, 2);
        assert_eq!(info.tile_type, TileType::Mvt);
        assert_eq!(info.tile_compression, Compression::Gzip);
        assert_eq!(info.vector_layers().unwrap()[0]["id"], "water");
        assert!((info.bounds[0] + 10.0).abs() < 1e-6);

        let raw = src.get_tile_raw(TileCoord::new(0, 0, 0)).await.unwrap().unwrap();
        assert_eq!(&raw[..2], &[0x1f, 0x8b], "raw tile is gzip");
        let dec = src.get_tile_decompressed(TileCoord::new(0, 0, 0)).await.unwrap().unwrap();
        assert_eq!(&dec[..], b"tile-0-0-0");
        let mb = src.get_tile_for_mbtiles(TileCoord::new(2, 1, 1)).await.unwrap().unwrap();
        assert_eq!(mb, raw_of(&src, 2, 1, 1).await);
        assert!(src.get_tile_raw(TileCoord::new(2, 0, 0)).await.unwrap().is_none());
    }

    async fn raw_of(src: &PmtilesSource, z: u8, x: u32, y: u32) -> Bytes {
        src.get_tile_raw(TileCoord::new(z, x, y)).await.unwrap().unwrap()
    }

    #[tokio::test]
    async fn open_missing_file_fails() {
        let err = PmtilesSource::open("/definitely/not/here.pmtiles").await.unwrap_err();
        assert!(matches!(err, SourceError::Open { .. }));
    }

    #[test]
    fn gzip_roundtrip() {
        let out = gzip(b"hello world").unwrap();
        let mut dec = flate2::read::GzDecoder::new(&out[..]);
        let mut s = String::new();
        std::io::Read::read_to_string(&mut dec, &mut s).unwrap();
        assert_eq!(s, "hello world");
    }
}

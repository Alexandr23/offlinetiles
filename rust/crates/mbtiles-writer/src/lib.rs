//! MBTiles output for the tile generator.
//!
//! Design constraints (from the PRD):
//!
//! * exactly one writer owns the SQLite connection — producers hand tiles to it
//!   through a channel, never touching SQLite themselves;
//! * inserts are batched into transactions of [`WriterOptions::batch_size`];
//! * output is written to `<path>.tmp` and atomically renamed on success, so a
//!   crash or cancellation never leaves a half-written `map.mbtiles` behind;
//! * XYZ → TMS conversion happens in exactly one place ([`tms`]).

pub mod tms;

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tile_selector::TileCoord;

#[derive(Debug, Error)]
pub enum WriterError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error at {path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("metadata serialisation failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("writer already finished")]
    AlreadyFinished,
    #[error("output path has no file name: {0}")]
    InvalidPath(PathBuf),
}

pub type Result<T> = std::result::Result<T, WriterError>;

/// Tile payload format recorded in the `metadata.format` row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TileFormat {
    /// Mapbox Vector Tile (gzip-compressed protobuf).
    Pbf,
    /// Raster PNG.
    Png,
}

impl TileFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            TileFormat::Pbf => "pbf",
            TileFormat::Png => "png",
        }
    }
}

/// Metadata rows written into the `metadata` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbtilesMetadata {
    pub name: String,
    pub description: Option<String>,
    pub attribution: Option<String>,
    pub format: TileFormat,
    pub min_zoom: u8,
    pub max_zoom: u8,
    /// `[west, south, east, north]` in degrees.
    pub bounds: [f64; 4],
    /// `(lon, lat, zoom)`.
    pub center: (f64, f64, u8),
    /// For vector tiles: the TileJSON `vector_layers` array (and anything else
    /// that belongs in the `json` metadata row). Ignored for raster output.
    pub vector_layers: Option<serde_json::Value>,
    /// Extra free-form rows (e.g. `generator`, `generator_version`).
    pub extra: Vec<(String, String)>,
}

/// Statistics returned when the writer finishes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct WriterStats {
    pub tiles: u64,
    pub bytes: u64,
}

/// Something that accepts tiles. Implemented by [`MbtilesWriter`]; a second
/// implementation (e.g. a directory or PMTiles writer) only needs this trait.
pub trait TileWriter: Send {
    fn write_tile(&mut self, tile: TileCoord, data: &[u8]) -> Result<()>;
    /// Flush, finalise metadata, and atomically move the output into place.
    fn finish(&mut self) -> Result<WriterStats>;
    /// Abort and remove any temporary output.
    fn abort(&mut self) -> Result<()>;
}

#[derive(Debug, Clone)]
pub struct WriterOptions {
    /// Tiles per transaction.
    pub batch_size: usize,
}

impl Default for WriterOptions {
    fn default() -> Self {
        Self { batch_size: 2000 }
    }
}

/// Single-connection MBTiles writer.
pub struct MbtilesWriter {
    conn: Option<Connection>,
    final_path: PathBuf,
    tmp_path: PathBuf,
    metadata: MbtilesMetadata,
    options: WriterOptions,
    in_batch: usize,
    stats: WriterStats,
    finished: bool,
}

impl MbtilesWriter {
    /// Create a writer that will produce `final_path`. Any stale temporary file
    /// is removed first; the final file is only created on [`TileWriter::finish`].
    pub fn create(final_path: impl AsRef<Path>, metadata: MbtilesMetadata, options: WriterOptions) -> Result<Self> {
        let final_path = final_path.as_ref().to_path_buf();
        let tmp_path = temp_path_for(&final_path)?;
        remove_if_exists(&tmp_path)?;
        if let Some(parent) = final_path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|source| WriterError::Io { path: parent.to_path_buf(), source })?;
            }
        }

        let conn = Connection::open(&tmp_path)?;
        // Everything is rebuilt from scratch and the file is renamed atomically
        // at the end, so durability guarantees during the write are pointless.
        conn.execute_batch(
            "PRAGMA journal_mode = OFF;
             PRAGMA synchronous = OFF;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -65536;
             PRAGMA page_size = 4096;
             CREATE TABLE metadata (name TEXT, value TEXT);
             CREATE TABLE tiles (
               zoom_level INTEGER NOT NULL,
               tile_column INTEGER NOT NULL,
               tile_row INTEGER NOT NULL,
               tile_data BLOB NOT NULL
             );",
        )?;
        conn.execute_batch("BEGIN;")?;

        Ok(Self {
            conn: Some(conn),
            final_path,
            tmp_path,
            metadata,
            options,
            in_batch: 0,
            stats: WriterStats::default(),
            finished: false,
        })
    }

    pub fn final_path(&self) -> &Path {
        &self.final_path
    }

    pub fn stats(&self) -> WriterStats {
        self.stats
    }

    fn write_metadata(&self, conn: &Connection) -> Result<()> {
        let m = &self.metadata;
        let mut rows: Vec<(String, String)> = vec![
            ("name".into(), m.name.clone()),
            ("format".into(), m.format.as_str().into()),
            ("type".into(), "baselayer".into()),
            ("version".into(), "1".into()),
            ("scheme".into(), "tms".into()),
            ("minzoom".into(), m.min_zoom.to_string()),
            ("maxzoom".into(), m.max_zoom.to_string()),
            ("bounds".into(), format!("{},{},{},{}", m.bounds[0], m.bounds[1], m.bounds[2], m.bounds[3])),
            ("center".into(), format!("{},{},{}", m.center.0, m.center.1, m.center.2)),
        ];
        if let Some(d) = &m.description {
            rows.push(("description".into(), d.clone()));
        }
        if let Some(a) = &m.attribution {
            rows.push(("attribution".into(), a.clone()));
        }
        if m.format == TileFormat::Pbf {
            let json = match &m.vector_layers {
                Some(v) if v.is_object() => v.clone(),
                Some(v) => serde_json::json!({ "vector_layers": v }),
                None => serde_json::json!({ "vector_layers": [] }),
            };
            rows.push(("json".into(), serde_json::to_string(&json)?));
        }
        rows.extend(m.extra.iter().cloned());

        let mut stmt = conn.prepare("INSERT INTO metadata (name, value) VALUES (?1, ?2)")?;
        for (k, v) in rows {
            stmt.execute(params![k, v])?;
        }
        Ok(())
    }
}

impl TileWriter for MbtilesWriter {
    fn write_tile(&mut self, tile: TileCoord, data: &[u8]) -> Result<()> {
        if self.finished {
            return Err(WriterError::AlreadyFinished);
        }
        let conn = self.conn.as_ref().ok_or(WriterError::AlreadyFinished)?;
        let tms_row = tms::xyz_to_tms_row(tile.z, tile.y);
        {
            let mut stmt = conn.prepare_cached(
                "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?1, ?2, ?3, ?4)",
            )?;
            stmt.execute(params![tile.z as i64, tile.x as i64, tms_row as i64, data])?;
        }
        let flush = self.in_batch + 1 >= self.options.batch_size;
        if flush {
            conn.execute_batch("COMMIT; BEGIN;")?;
        }
        self.stats.tiles += 1;
        self.stats.bytes += data.len() as u64;
        self.in_batch = if flush { 0 } else { self.in_batch + 1 };
        Ok(())
    }

    fn finish(&mut self) -> Result<WriterStats> {
        if self.finished {
            return Err(WriterError::AlreadyFinished);
        }
        let conn = self.conn.take().ok_or(WriterError::AlreadyFinished)?;
        conn.execute_batch("COMMIT;")?;
        // Building the index after bulk insert is markedly faster than
        // maintaining it per row.
        conn.execute_batch("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);")?;
        conn.execute_batch("BEGIN;")?;
        self.write_metadata(&conn)?;
        conn.execute_batch("COMMIT;")?;
        conn.close().map_err(|(_, e)| WriterError::Sqlite(e))?;

        remove_if_exists(&self.final_path)?;
        std::fs::rename(&self.tmp_path, &self.final_path)
            .map_err(|source| WriterError::Io { path: self.final_path.clone(), source })?;
        self.finished = true;
        Ok(self.stats)
    }

    fn abort(&mut self) -> Result<()> {
        if let Some(conn) = self.conn.take() {
            let _ = conn.execute_batch("ROLLBACK;");
            let _ = conn.close();
        }
        self.finished = true;
        remove_if_exists(&self.tmp_path)
    }
}

impl Drop for MbtilesWriter {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.abort();
        }
    }
}

/// `map.mbtiles` → `map.mbtiles.tmp`
pub fn temp_path_for(final_path: &Path) -> Result<PathBuf> {
    let name = final_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| WriterError::InvalidPath(final_path.to_path_buf()))?;
    Ok(final_path.with_file_name(format!("{name}.tmp")))
}

fn remove_if_exists(path: &Path) -> Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(WriterError::Io { path: path.to_path_buf(), source }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(format: TileFormat) -> MbtilesMetadata {
        MbtilesMetadata {
            name: "Test".into(),
            description: Some("desc".into()),
            attribution: Some("© OpenStreetMap contributors".into()),
            format,
            min_zoom: 0,
            max_zoom: 2,
            bounds: [-180.0, -85.0, 180.0, 85.0],
            center: (0.0, 0.0, 1),
            vector_layers: Some(serde_json::json!([{ "id": "water", "fields": {} }])),
            extra: vec![("generator".into(), "tile-generator".into())],
        }
    }

    #[test]
    fn writes_tiles_with_tms_rows_and_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("map.mbtiles");
        let mut w = MbtilesWriter::create(&out, meta(TileFormat::Pbf), WriterOptions { batch_size: 2 }).unwrap();
        assert!(dir.path().join("map.mbtiles.tmp").exists());
        assert!(!out.exists());

        w.write_tile(TileCoord::new(0, 0, 0), b"root").unwrap();
        w.write_tile(TileCoord::new(1, 0, 0), b"nw").unwrap();
        w.write_tile(TileCoord::new(1, 1, 1), b"se").unwrap();
        w.write_tile(TileCoord::new(2, 3, 0), b"z2").unwrap();
        let stats = w.finish().unwrap();
        assert_eq!(stats, WriterStats { tiles: 4, bytes: 4 + 2 + 2 + 2 });
        assert!(out.exists());
        assert!(!dir.path().join("map.mbtiles.tmp").exists());

        let conn = Connection::open(&out).unwrap();
        // XYZ (1,0,0) → TMS row 1; XYZ (1,1,1) → TMS row 0; XYZ (2,3,0) → TMS row 3.
        let nw: Vec<u8> = conn
            .query_row("SELECT tile_data FROM tiles WHERE zoom_level=1 AND tile_column=0 AND tile_row=1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(nw, b"nw");
        let se: Vec<u8> = conn
            .query_row("SELECT tile_data FROM tiles WHERE zoom_level=1 AND tile_column=1 AND tile_row=0", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(se, b"se");
        let z2: Vec<u8> = conn
            .query_row("SELECT tile_data FROM tiles WHERE zoom_level=2 AND tile_column=3 AND tile_row=3", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(z2, b"z2");

        let get = |k: &str| -> String {
            conn.query_row("SELECT value FROM metadata WHERE name=?1", [k], |r| r.get(0)).unwrap()
        };
        assert_eq!(get("name"), "Test");
        assert_eq!(get("format"), "pbf");
        assert_eq!(get("minzoom"), "0");
        assert_eq!(get("maxzoom"), "2");
        assert_eq!(get("bounds"), "-180,-85,180,85");
        assert_eq!(get("center"), "0,0,1");
        assert_eq!(get("generator"), "tile-generator");
        let json: serde_json::Value = serde_json::from_str(&get("json")).unwrap();
        assert_eq!(json["vector_layers"][0]["id"], "water");

        let idx: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='tile_index'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn raster_metadata_has_no_json_row() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("r.mbtiles");
        let mut w = MbtilesWriter::create(&out, meta(TileFormat::Png), WriterOptions::default()).unwrap();
        w.write_tile(TileCoord::new(0, 0, 0), b"png").unwrap();
        w.finish().unwrap();
        let conn = Connection::open(&out).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM metadata WHERE name='json'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        let f: String = conn.query_row("SELECT value FROM metadata WHERE name='format'", [], |r| r.get(0)).unwrap();
        assert_eq!(f, "png");
    }

    #[test]
    fn abort_and_drop_remove_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("a.mbtiles");
        {
            let mut w = MbtilesWriter::create(&out, meta(TileFormat::Pbf), WriterOptions::default()).unwrap();
            w.write_tile(TileCoord::new(0, 0, 0), b"x").unwrap();
            w.abort().unwrap();
            assert!(!dir.path().join("a.mbtiles.tmp").exists());
        }
        {
            let mut w = MbtilesWriter::create(&out, meta(TileFormat::Pbf), WriterOptions::default()).unwrap();
            w.write_tile(TileCoord::new(0, 0, 0), b"x").unwrap();
            // dropped without finish
        }
        assert!(!dir.path().join("a.mbtiles.tmp").exists());
        assert!(!out.exists());
    }

    #[test]
    fn finish_replaces_existing_output() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("b.mbtiles");
        std::fs::write(&out, b"stale").unwrap();
        let mut w = MbtilesWriter::create(&out, meta(TileFormat::Pbf), WriterOptions::default()).unwrap();
        w.write_tile(TileCoord::new(0, 0, 0), b"x").unwrap();
        w.finish().unwrap();
        assert!(std::fs::metadata(&out).unwrap().len() > 5);
        assert!(w.finish().is_err());
    }
}

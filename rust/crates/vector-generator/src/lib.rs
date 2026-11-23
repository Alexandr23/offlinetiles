//! Vector export: tiles are copied byte-for-byte (still gzip-compressed) from
//! the master PMTiles archive into an MBTiles file. No decoding, no
//! re-encoding — the only transformation is the XYZ→TMS row flip performed by
//! the writer.

use std::sync::Arc;

use generator_core::job::{build_metadata, resolve_selection};
use generator_core::protocol::GenerateRequest;
use generator_core::{
    run_pipeline, CancelToken, GeneratorError, PipelineConfig, PipelineOutcome, PipelinePlan, ProduceFuture, Reporter,
    Result, TileProducer,
};
use mbtiles_writer::{MbtilesWriter, TileFormat, WriterOptions};
use pmtiles_source::PmtilesSource;
use tile_selector::TileCoord;

/// Reads tiles from a shared PMTiles source. Cheap to clone per worker.
pub struct VectorProducer {
    source: Arc<PmtilesSource>,
}

impl VectorProducer {
    pub fn new(source: Arc<PmtilesSource>) -> Self {
        Self { source }
    }
}

impl TileProducer for VectorProducer {
    fn produce(&mut self, tile: TileCoord) -> ProduceFuture<'_> {
        Box::pin(async move { Ok(self.source.get_tile_for_mbtiles(tile).await?) })
    }
}

/// Run a complete vector export for `req`.
pub async fn run_vector_job(
    req: &GenerateRequest,
    reporter: Arc<dyn Reporter>,
    cancel: CancelToken,
    config: PipelineConfig,
) -> Result<PipelineOutcome> {
    let sel = resolve_selection(req)?;
    let source = Arc::new(PmtilesSource::open_vector(req.source.path()).await?);
    let info = source.info();
    if sel.range.min > info.max_zoom {
        return Err(GeneratorError::ZoomRange(tile_selector::SelectionError::InvalidZoomRange {
            min: sel.range.min,
            max: info.max_zoom,
        }));
    }

    let metadata = build_metadata(req, &sel, TileFormat::Pbf, info.vector_layers().cloned(), info.attribution());
    let writer = MbtilesWriter::create(&req.output.path, metadata, WriterOptions::default())?;

    let workers = req.effective_threads();
    let producers: Vec<Box<dyn TileProducer>> =
        (0..workers).map(|_| Box::new(VectorProducer::new(source.clone())) as Box<dyn TileProducer>).collect();

    run_pipeline(
        PipelinePlan { area: sel.area, range: sel.range, total: sel.total },
        producers,
        Box::new(writer),
        reporter,
        cancel,
        config,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use generator_core::{MemoryReporter, Message};
    use pmtiles_source::fixture::{mvt_tile, write_fixture, FixtureOptions};
    use rusqlite::Connection;

    fn request(source: &str, out: &str, min: u8, max: u8) -> GenerateRequest {
        GenerateRequest::parse(&format!(
            r#"{{"protocolVersion":1,"jobId":"job-1","source":{{"type":"pmtiles","path":"{source}"}},
            "selection":{{"geometry":{{"type":"Polygon","coordinates":[[[-45,-45],[45,-45],[45,45],[-45,45],[-45,-45]]]}},"minZoom":{min},"maxZoom":{max}}},
            "output":{{"content":"vector","container":"mbtiles","path":"{out}","metadata":{{"name":"Fixture export","description":"d"}}}},
            "style":null,"threads":3}}"#
        ))
        .unwrap()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn exports_matching_tiles_into_mbtiles() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("fx.pmtiles");
        write_fixture(&src, &FixtureOptions { min_zoom: 0, max_zoom: 5, ..Default::default() }).unwrap();
        let out = dir.path().join("exports").join("job-1").join("map.mbtiles");
        let req = request(&src.to_string_lossy(), &out.to_string_lossy(), 1, 4);

        let reporter = Arc::new(MemoryReporter::default());
        let outcome =
            run_vector_job(&req, reporter.clone(), CancelToken::new(), PipelineConfig::default()).await.unwrap();

        let sel = resolve_selection(&req).unwrap();
        assert_eq!(outcome.processed, sel.total);
        assert_eq!(outcome.tiles, sel.total, "fixture covers the world, so every tile exists");
        assert!(out.exists());
        assert!(!out.with_file_name("map.mbtiles.tmp").exists());

        let conn = Connection::open(&out).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tiles", [], |r| r.get(0)).unwrap();
        assert_eq!(n as u64, sel.total);
        let zooms: Vec<i64> = conn
            .prepare("SELECT DISTINCT zoom_level FROM tiles ORDER BY zoom_level")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(zooms, vec![1, 2, 3, 4]);

        // Tile 2/1/1 in XYZ is stored at TMS row 4-1-1 = 2 and must be the gzip of the fixture MVT.
        let blob: Vec<u8> = conn
            .query_row("SELECT tile_data FROM tiles WHERE zoom_level=2 AND tile_column=1 AND tile_row=2", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(&blob[..2], &[0x1f, 0x8b]);
        let mut dec = Vec::new();
        std::io::Read::read_to_end(&mut flate2::read::GzDecoder::new(&blob[..]), &mut dec).unwrap();
        assert_eq!(dec, mvt_tile(2, 1, 1));

        let meta = |k: &str| -> String {
            conn.query_row("SELECT value FROM metadata WHERE name=?1", [k], |r| r.get(0)).unwrap()
        };
        assert_eq!(meta("format"), "pbf");
        assert_eq!(meta("name"), "Fixture export");
        assert_eq!(meta("minzoom"), "1");
        assert_eq!(meta("maxzoom"), "4");
        assert_eq!(meta("attribution"), "fixture");
        let json: serde_json::Value = serde_json::from_str(&meta("json")).unwrap();
        assert_eq!(json["vector_layers"][0]["id"], "water");

        let msgs = reporter.snapshot();
        assert!(matches!(msgs.first(), Some(Message::Started { .. })));
        assert!(matches!(msgs.last(), Some(Message::Packaging)));
    }

    #[tokio::test]
    async fn missing_source_is_reported_as_unavailable() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("map.mbtiles");
        let req = request("/not/here.pmtiles", &out.to_string_lossy(), 0, 2);
        let err =
            run_vector_job(&req, Arc::new(MemoryReporter::default()), CancelToken::new(), PipelineConfig::default())
                .await
                .unwrap_err();
        assert_eq!(err.code(), "SOURCE_UNAVAILABLE");
        assert!(!out.exists());
    }
}

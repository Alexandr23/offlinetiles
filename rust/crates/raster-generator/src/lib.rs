//! Raster export: each worker owns one renderer, renders tiles to RGBA, clips
//! pixels outside the selection to transparent, encodes PNG, and hands the
//! bytes to the shared MBTiles writer.

pub mod image;
pub mod renderer;

use std::sync::Arc;

use bytes::Bytes;
use generator_core::job::{build_metadata, resolve_selection};
use generator_core::protocol::GenerateRequest;
use generator_core::{
    run_pipeline, CancelToken, GeneratorError, PipelineConfig, PipelineOutcome, PipelinePlan, ProduceFuture, Reporter,
    Result, ShutdownFuture, TileProducer,
};
use mbtiles_writer::{MbtilesWriter, TileFormat, WriterOptions};
use pmtiles_source::PmtilesSource;
use tile_selector::{SelectionArea, TileCoord};

pub use image::RgbaImage;
pub use renderer::{RasterRenderer, RendererInit, SidecarRenderer};

/// Upper bound on concurrent renderer processes; each MapLibre Native instance
/// holds its own tile cache and GL context, so more is rarely faster.
pub const MAX_RENDERERS: usize = 8;

/// Adapts any [`RasterRenderer`] to the pipeline's [`TileProducer`].
pub struct RasterProducer<R: RasterRenderer> {
    renderer: R,
    area: Arc<SelectionArea>,
}

impl<R: RasterRenderer> RasterProducer<R> {
    pub fn new(renderer: R, area: Arc<SelectionArea>) -> Self {
        Self { renderer, area }
    }
}

impl<R: RasterRenderer + 'static> TileProducer for RasterProducer<R> {
    fn produce(&mut self, tile: TileCoord) -> ProduceFuture<'_> {
        Box::pin(async move {
            let mut img = self.renderer.render(tile).await?;
            img.clip_to_selection(tile, &self.area);
            let png = img.encode_png()?;
            Ok(Some(Bytes::from(png)))
        })
    }

    fn shutdown(&mut self) -> ShutdownFuture<'_> {
        Box::pin(async move { self.renderer.close().await })
    }
}

/// Number of renderer workers for a request.
pub fn renderer_count(req: &GenerateRequest) -> usize {
    req.effective_threads().clamp(1, MAX_RENDERERS)
}

/// Run a complete raster export for `req` using sidecar renderers.
pub async fn run_raster_job(
    req: &GenerateRequest,
    reporter: Arc<dyn Reporter>,
    cancel: CancelToken,
    config: PipelineConfig,
) -> Result<PipelineOutcome> {
    let renderer_spec =
        req.renderer.as_ref().ok_or_else(|| GeneratorError::RendererStart("renderer settings missing".into()))?;
    let style = req.style.clone().ok_or_else(|| GeneratorError::RendererStart("style missing".into()))?;
    let init = RendererInit {
        style,
        source_path: req.source.path().to_string(),
        fonts_dir: renderer_spec.fonts_dir.clone(),
        tile_size: req.tile_size(),
    };
    let sel = resolve_selection(req)?;
    let area = Arc::new(sel.area);

    let mut renderers: Vec<Box<dyn TileProducer>> = Vec::new();
    for _ in 0..renderer_count(req) {
        if cancel.is_cancelled() {
            return Err(GeneratorError::Cancelled);
        }
        let r = SidecarRenderer::spawn(&renderer_spec.command, &init).await?;
        renderers.push(Box::new(RasterProducer::new(r, Arc::clone(&area))));
    }
    run_raster_job_with(req, renderers, reporter, cancel, config).await
}

/// Raster export with caller-supplied producers (used by tests and alternative renderers).
pub async fn run_raster_job_with(
    req: &GenerateRequest,
    producers: Vec<Box<dyn TileProducer>>,
    reporter: Arc<dyn Reporter>,
    cancel: CancelToken,
    config: PipelineConfig,
) -> Result<PipelineOutcome> {
    let sel = resolve_selection(req)?;
    // The source is only opened for its attribution/metadata; the renderer reads tiles itself.
    let source = PmtilesSource::open_vector(req.source.path()).await?;
    let metadata = build_metadata(req, &sel, TileFormat::Png, None, source.info().attribution());
    drop(source);
    let writer = MbtilesWriter::create(&req.output.path, metadata, WriterOptions::default())?;
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
    use generator_core::MemoryReporter;
    use pmtiles_source::fixture::{write_fixture, FixtureOptions};
    use renderer::{CloseFuture, RenderFuture};
    use rusqlite::Connection;

    struct SolidRenderer;
    impl RasterRenderer for SolidRenderer {
        fn render(&mut self, tile: TileCoord) -> RenderFuture<'_> {
            Box::pin(async move { Ok(RgbaImage::solid(256, 256, [tile.x as u8, tile.y as u8, tile.z, 255])) })
        }
        fn close(&mut self) -> CloseFuture<'_> {
            Box::pin(async {})
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn raster_job_writes_png_tiles() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("fx.pmtiles");
        write_fixture(&src, &FixtureOptions { min_zoom: 0, max_zoom: 4, ..Default::default() }).unwrap();
        let out = dir.path().join("map.mbtiles");
        let req = GenerateRequest::parse(&format!(
            r#"{{"protocolVersion":1,"jobId":"r1","source":{{"type":"pmtiles","path":"{}"}},
            "selection":{{"geometry":{{"type":"Polygon","coordinates":[[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]]]}},"minZoom":0,"maxZoom":3}},
            "output":{{"content":"raster","container":"mbtiles","path":"{}","rasterFormat":"png","tileSize":256,"metadata":{{"name":"Raster"}}}},
            "style":{{"version":8,"sources":{{}},"layers":[]}},
            "renderer":{{"command":["unused"],"fontsDir":"/fonts"}},"threads":2}}"#,
            src.to_string_lossy(),
            out.to_string_lossy()
        ))
        .unwrap();
        assert_eq!(renderer_count(&req), 2);

        let area = Arc::new(resolve_selection(&req).unwrap().area);
        let producers: Vec<Box<dyn TileProducer>> = (0..2)
            .map(|_| Box::new(RasterProducer::new(SolidRenderer, Arc::clone(&area))) as Box<dyn TileProducer>)
            .collect();
        let outcome = run_raster_job_with(
            &req,
            producers,
            Arc::new(MemoryReporter::default()),
            CancelToken::new(),
            PipelineConfig::default(),
        )
        .await
        .unwrap();
        assert!(outcome.tiles > 0);
        assert_eq!(outcome.tiles, outcome.processed);

        let conn = Connection::open(&out).unwrap();
        let format: String =
            conn.query_row("SELECT value FROM metadata WHERE name='format'", [], |r| r.get(0)).unwrap();
        assert_eq!(format, "png");
        let tile_size: String =
            conn.query_row("SELECT value FROM metadata WHERE name='tile_size'", [], |r| r.get(0)).unwrap();
        assert_eq!(tile_size, "256");
        let blob: Vec<u8> = conn.query_row("SELECT tile_data FROM tiles WHERE zoom_level=0", [], |r| r.get(0)).unwrap();
        assert_eq!(&blob[..4], &[0x89, b'P', b'N', b'G']);
    }
}

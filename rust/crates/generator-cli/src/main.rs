//! `tile-generator` — the process the Node worker spawns.
//!
//! ```text
//! tile-generator generate <request.json>   # JSON-lines progress on stdout, exit 0 on success/cancel, 1 on failure
//! tile-generator estimate <request.json>   # single {"type":"estimate",…} line on stdout
//! tile-generator fixture <out.pmtiles> [--max-zoom N] [--bbox W,S,E,N]
//! tile-generator benchmark [--max-zoom N] [--threads N]
//! tile-generator --version
//! ```
//!
//! stdout is strictly machine-readable; diagnostics go to stderr. SIGTERM/SIGINT
//! request cooperative cancellation; the writer removes its temporary file.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Instant;

use generator_core::protocol::{Content, EstimateRequest, GenerateRequest};
use generator_core::{estimate, CancelToken, GeneratorError, Message, PipelineConfig, Reporter, StdoutReporter};
use pmtiles_source::fixture::{write_fixture, FixtureOptions};

const USAGE: &str = "usage:
  tile-generator generate <request.json>
  tile-generator estimate <request.json>
  tile-generator fixture <out.pmtiles> [--max-zoom N] [--bbox W,S,E,N]
  tile-generator benchmark [--max-zoom N] [--threads N]
  tile-generator --version";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first().map(String::as_str) else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    match cmd {
        "--version" | "-V" | "version" => {
            println!("tile-generator {} (protocol {})", env!("CARGO_PKG_VERSION"), generator_core::PROTOCOL_VERSION);
            ExitCode::SUCCESS
        }
        "generate" => with_runtime(|| cmd_generate(args.get(1).map(PathBuf::from))),
        "estimate" => with_runtime(|| cmd_estimate(args.get(1).map(PathBuf::from))),
        "fixture" => match cmd_fixture(&args[1..]) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("fixture failed: {e}");
                ExitCode::from(1)
            }
        },
        "benchmark" => with_runtime(|| cmd_benchmark(&args[1..])),
        other => {
            eprintln!("unknown command `{other}`\n{USAGE}");
            ExitCode::from(2)
        }
    }
}

fn with_runtime<F, Fut>(f: F) -> ExitCode
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = ExitCode>,
{
    match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(rt) => rt.block_on(f()),
        Err(e) => {
            eprintln!("failed to start runtime: {e}");
            ExitCode::from(1)
        }
    }
}

fn read_request_file(path: Option<PathBuf>) -> Result<String, String> {
    let path = path.ok_or_else(|| format!("missing request file\n{USAGE}"))?;
    std::fs::read_to_string(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

/// Install SIGTERM/SIGINT handlers that flip the cancel token.
fn install_signal_handlers(cancel: CancelToken) {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        if let Ok(mut term) = signal(SignalKind::terminate()) {
            let c = cancel.clone();
            tokio::spawn(async move {
                term.recv().await;
                eprintln!("[tile-generator] SIGTERM received, cancelling");
                c.cancel();
            });
        }
    }
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            eprintln!("[tile-generator] interrupt received, cancelling");
            cancel.cancel();
        }
    });
}

async fn cmd_generate(path: Option<PathBuf>) -> ExitCode {
    let reporter: Arc<dyn Reporter> = Arc::new(StdoutReporter::default());
    let fail = |code: &str, message: String| {
        reporter.emit(&Message::Failed { code: code.to_string(), message });
        ExitCode::from(1)
    };

    let json = match read_request_file(path) {
        Ok(j) => j,
        Err(e) => return fail("INVALID_REQUEST", e),
    };
    let req = match GenerateRequest::parse(&json) {
        Ok(r) => r,
        Err(e) => return fail("INVALID_REQUEST", e.to_string()),
    };

    let cancel = CancelToken::new();
    install_signal_handlers(cancel.clone());
    let started = Instant::now();
    eprintln!(
        "[tile-generator] job {} content={:?} zoom {}-{} threads={} → {}",
        req.job_id,
        req.output.content,
        req.selection.min_zoom,
        req.selection.max_zoom,
        req.effective_threads(),
        req.output.path
    );

    let result = match req.output.content {
        Content::Vector => {
            vector_generator::run_vector_job(&req, reporter.clone(), cancel.clone(), PipelineConfig::default()).await
        }
        Content::Raster => {
            raster_generator::run_raster_job(&req, reporter.clone(), cancel.clone(), PipelineConfig::default()).await
        }
    };

    match result {
        Ok(outcome) => {
            eprintln!(
                "[tile-generator] completed: {} tiles ({} processed), {} bytes in {} ms",
                outcome.tiles, outcome.processed, outcome.bytes, outcome.elapsed_ms
            );
            reporter.emit(&Message::Completed {
                tiles: outcome.tiles,
                bytes: outcome.bytes,
                elapsed_ms: started.elapsed().as_millis() as u64,
            });
            ExitCode::SUCCESS
        }
        Err(GeneratorError::Cancelled) => {
            eprintln!("[tile-generator] cancelled after {} ms", started.elapsed().as_millis());
            reporter.emit(&Message::Cancelled);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("[tile-generator] failed: {e}");
            fail(e.code(), e.to_string())
        }
    }
}

async fn cmd_estimate(path: Option<PathBuf>) -> ExitCode {
    let json = match read_request_file(path) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    let req = match EstimateRequest::parse(&json) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("invalid estimate request: {e}");
            return ExitCode::from(2);
        }
    };
    match estimate::estimate(&req).await {
        Ok(result) => {
            println!("{}", serde_json::to_string(&result).unwrap_or_else(|_| "{}".into()));
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("estimate failed [{}]: {e}", e.code());
            ExitCode::from(1)
        }
    }
}

fn parse_flag<T: std::str::FromStr>(args: &[String], name: &str) -> Result<Option<T>, String> {
    let mut iter = args.iter();
    while let Some(a) = iter.next() {
        if a == name {
            let v = iter.next().ok_or_else(|| format!("{name} needs a value"))?;
            return v.parse::<T>().map(Some).map_err(|_| format!("invalid value for {name}: {v}"));
        }
    }
    Ok(None)
}

fn parse_bbox(args: &[String]) -> Result<Option<[f64; 4]>, String> {
    let Some(raw) = parse_flag::<String>(args, "--bbox")? else { return Ok(None) };
    let parts: Vec<f64> = raw
        .split(',')
        .map(|p| p.trim().parse::<f64>())
        .collect::<Result<_, _>>()
        .map_err(|_| "bbox must be W,S,E,N".to_string())?;
    if parts.len() != 4 {
        return Err("bbox must be W,S,E,N".into());
    }
    Ok(Some([parts[0], parts[1], parts[2], parts[3]]))
}

fn cmd_fixture(args: &[String]) -> Result<(), String> {
    let out = args.first().filter(|a| !a.starts_with("--")).ok_or_else(|| format!("missing output path\n{USAGE}"))?;
    let max_zoom = parse_flag::<u8>(args, "--max-zoom")?.unwrap_or(6);
    let bounds = parse_bbox(args)?.unwrap_or(FixtureOptions::default().bounds);
    let opts = FixtureOptions { min_zoom: 0, max_zoom, bounds, name: "fixture".into() };
    let n = write_fixture(Path::new(out), &opts).map_err(|e| e.to_string())?;
    eprintln!("wrote {n} tiles to {out}");
    Ok(())
}

/// Builds a temporary fixture and runs a vector export against it, printing throughput.
async fn cmd_benchmark(args: &[String]) -> ExitCode {
    let max_zoom = match parse_flag::<u8>(args, "--max-zoom") {
        Ok(v) => v.unwrap_or(9),
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    let threads = parse_flag::<u32>(args, "--threads").ok().flatten().unwrap_or(0);
    let dir = match tempfile_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("cannot create temp dir: {e}");
            return ExitCode::from(1);
        }
    };
    let src = dir.join("bench.pmtiles");
    let out = dir.join("bench.mbtiles");
    let opts = FixtureOptions { min_zoom: 0, max_zoom, ..Default::default() };
    let t0 = Instant::now();
    let n = match write_fixture(&src, &opts) {
        Ok(n) => n,
        Err(e) => {
            eprintln!("fixture failed: {e}");
            return ExitCode::from(1);
        }
    };
    eprintln!("[benchmark] fixture: {n} tiles in {} ms", t0.elapsed().as_millis());

    let req = GenerateRequest {
        protocol_version: generator_core::PROTOCOL_VERSION,
        job_id: "benchmark".into(),
        source: generator_core::protocol::SourceSpec::Pmtiles { path: src.to_string_lossy().into() },
        selection: generator_core::protocol::SelectionSpec {
            geometry: serde_json::json!({"type":"Polygon","coordinates":[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}),
            min_zoom: 0,
            max_zoom,
        },
        output: generator_core::protocol::OutputSpec {
            content: Content::Vector,
            container: generator_core::protocol::Container::Mbtiles,
            path: out.to_string_lossy().into(),
            raster_format: None,
            tile_size: None,
            metadata: generator_core::protocol::OutputMetadata {
                name: "benchmark".into(),
                description: None,
                attribution: None,
            },
        },
        style: None,
        renderer: None,
        threads,
    };
    let reporter: Arc<dyn Reporter> = Arc::new(generator_core::MemoryReporter::default());
    let t1 = Instant::now();
    let result = vector_generator::run_vector_job(&req, reporter, CancelToken::new(), PipelineConfig::default()).await;
    let code = match result {
        Ok(o) => {
            let secs = t1.elapsed().as_secs_f64();
            println!(
                "{}",
                serde_json::json!({
                    "type": "benchmark",
                    "tiles": o.tiles,
                    "bytes": o.bytes,
                    "elapsedMs": (secs * 1000.0) as u64,
                    "tilesPerSecond": (o.tiles as f64 / secs).round(),
                    "threads": req.effective_threads(),
                })
            );
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("benchmark failed: {e}");
            ExitCode::from(1)
        }
    };
    let _ = std::fs::remove_dir_all(&dir);
    code
}

fn tempfile_dir() -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join(format!("tile-generator-bench-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

//! The producer → writer pipeline.
//!
//! ```text
//!  TileIter ──feeder──▶ [bounded MPMC] ──▶ producer 0 ─┐
//!                                      ├▶ producer 1 ─┼─▶ [bounded MPSC] ──▶ writer thread (SQLite)
//!                                      └▶ producer N ─┘
//! ```
//!
//! * The feeder streams tiles straight from the quadtree iterator, so memory
//!   does not scale with the number of selected tiles.
//! * Producers are generic ([`TileProducer`]): the vector producer copies
//!   bytes out of PMTiles, the raster producer drives a renderer sidecar.
//! * Exactly one thread owns the SQLite connection.
//! * Bounded channels provide back-pressure in both directions.
//! * Cancellation and the first error stop every stage; the writer then
//!   aborts and removes its temporary file.

use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bytes::Bytes;
use mbtiles_writer::{TileWriter, WriterStats};
use tile_selector::{SelectionArea, TileCoord, TileIter, ZoomRange};

use crate::cancel::CancelToken;
use crate::error::{GeneratorError, Result};
use crate::protocol::Message;
use crate::reporter::{ProgressTracker, Reporter};

pub type ProduceFuture<'a> = Pin<Box<dyn Future<Output = Result<Option<Bytes>>> + Send + 'a>>;
pub type ShutdownFuture<'a> = Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

/// Produces the bytes for one tile. One instance per worker; instances are
/// never shared, so implementations may hold mutable per-worker state (e.g. a
/// renderer process).
pub trait TileProducer: Send {
    /// `Ok(None)` means the tile does not exist in the source and is skipped.
    fn produce(&mut self, tile: TileCoord) -> ProduceFuture<'_>;
    /// Release resources. Called once after the last `produce`.
    fn shutdown(&mut self) -> ShutdownFuture<'_> {
        Box::pin(async {})
    }
}

#[derive(Debug, Clone)]
pub struct PipelineConfig {
    /// Capacity of the tile and output queues.
    pub queue_depth: usize,
    /// Minimum interval between `progress` messages.
    pub progress_interval: Duration,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self { queue_depth: 1024, progress_interval: Duration::from_millis(250) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PipelineOutcome {
    /// Tiles examined (including ones missing from the source).
    pub processed: u64,
    /// Tiles actually written.
    pub tiles: u64,
    pub bytes: u64,
    pub elapsed_ms: u64,
}

struct Item {
    tile: TileCoord,
    data: Option<Bytes>,
}

struct WriterOutcome {
    stats: Option<WriterStats>,
    processed: u64,
    error: Option<GeneratorError>,
}

type ErrorSlot = Arc<Mutex<Option<GeneratorError>>>;

fn record_error(slot: &ErrorSlot, cancel: &CancelToken, err: GeneratorError) {
    let mut guard = slot.lock().unwrap_or_else(|p| p.into_inner());
    if guard.is_none() {
        *guard = Some(err);
    }
    cancel.cancel();
}

/// What to generate: the selection plus its pre-computed tile count.
pub struct PipelinePlan {
    pub area: SelectionArea,
    pub range: ZoomRange,
    pub total: u64,
}

/// Run the full pipeline. Emits `started`, `progress`, and `packaging`; the
/// caller emits the terminal message based on the returned result.
pub async fn run_pipeline(
    plan: PipelinePlan,
    producers: Vec<Box<dyn TileProducer>>,
    writer: Box<dyn TileWriter>,
    reporter: Arc<dyn Reporter>,
    cancel: CancelToken,
    config: PipelineConfig,
) -> Result<PipelineOutcome> {
    let PipelinePlan { area, range, total } = plan;
    if producers.is_empty() {
        return Err(GeneratorError::Internal("pipeline needs at least one producer".into()));
    }
    let started = Instant::now();
    reporter.emit(&Message::Started { total_tiles: total });

    let producer_error: ErrorSlot = Arc::new(Mutex::new(None));
    let (tile_tx, tile_rx) = async_channel::bounded::<TileCoord>(config.queue_depth);
    let (item_tx, item_rx) = tokio::sync::mpsc::channel::<Item>(config.queue_depth);

    // --- feeder ---------------------------------------------------------------------------
    let feeder = {
        let cancel = cancel.clone();
        tokio::spawn(async move {
            let iter = TileIter::new(&area, range);
            for tile in iter {
                if cancel.is_cancelled() {
                    break;
                }
                if tile_tx.send(tile).await.is_err() {
                    break;
                }
            }
            // dropping tile_tx closes the channel once all producers drain it
        })
    };

    // --- producers ------------------------------------------------------------------------
    let mut producer_tasks = Vec::with_capacity(producers.len());
    for mut producer in producers {
        let rx = tile_rx.clone();
        let tx = item_tx.clone();
        let cancel = cancel.clone();
        let slot = producer_error.clone();
        producer_tasks.push(tokio::spawn(async move {
            loop {
                let tile = tokio::select! {
                    biased;
                    _ = cancel.cancelled() => break,
                    r = rx.recv() => match r {
                        Ok(t) => t,
                        Err(_) => break,
                    },
                };
                match producer.produce(tile).await {
                    Ok(data) => {
                        if tx.send(Item { tile, data }).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        record_error(&slot, &cancel, e);
                        break;
                    }
                }
            }
            producer.shutdown().await;
        }));
    }
    drop(item_tx);
    drop(tile_rx);

    // --- writer ---------------------------------------------------------------------------
    let writer_task = {
        let reporter = reporter.clone();
        let cancel = cancel.clone();
        let interval = config.progress_interval;
        let mut rx = item_rx;
        tokio::task::spawn_blocking(move || -> WriterOutcome {
            let mut writer = writer;
            let mut tracker = ProgressTracker::new(reporter.clone(), total, interval);
            let mut error: Option<GeneratorError> = None;
            while let Some(item) = rx.blocking_recv() {
                if cancel.is_cancelled() {
                    break;
                }
                match item.data {
                    Some(data) => {
                        if let Err(e) = writer.write_tile(item.tile, &data) {
                            error = Some(e.into());
                            cancel.cancel();
                            break;
                        }
                        tracker.record(Some(data.len()));
                    }
                    None => tracker.record(None),
                }
            }
            // Drain anything producers already queued so they are not blocked on send.
            rx.close();
            while rx.blocking_recv().is_some() {}

            if error.is_none() && !cancel.is_cancelled() {
                tracker.flush();
                reporter.emit(&Message::Packaging);
                match writer.finish() {
                    Ok(stats) => {
                        return WriterOutcome { stats: Some(stats), processed: tracker.completed, error: None };
                    }
                    Err(e) => error = Some(e.into()),
                }
            }
            let _ = writer.abort();
            WriterOutcome { stats: None, processed: tracker.completed, error }
        })
    };

    for task in producer_tasks {
        if let Err(e) = task.await {
            record_error(&producer_error, &cancel, GeneratorError::Internal(format!("producer task panicked: {e}")));
        }
    }
    let _ = feeder.await;
    let writer_outcome =
        writer_task.await.map_err(|e| GeneratorError::Internal(format!("writer thread panicked: {e}")))?;

    if let Some(err) = producer_error.lock().unwrap_or_else(|p| p.into_inner()).take() {
        return Err(err);
    }
    if let Some(err) = writer_outcome.error {
        return Err(err);
    }
    if cancel.is_cancelled() {
        return Err(GeneratorError::Cancelled);
    }
    let stats = writer_outcome.stats.ok_or_else(|| GeneratorError::Internal("writer produced no stats".into()))?;
    Ok(PipelineOutcome {
        processed: writer_outcome.processed,
        tiles: stats.tiles,
        bytes: stats.bytes,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reporter::MemoryReporter;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Producer that returns the tile address as bytes, skipping odd x.
    struct FakeProducer {
        calls: Arc<AtomicU64>,
        fail_at: Option<TileCoord>,
        delay: Duration,
    }

    impl TileProducer for FakeProducer {
        fn produce(&mut self, tile: TileCoord) -> ProduceFuture<'_> {
            Box::pin(async move {
                if !self.delay.is_zero() {
                    tokio::time::sleep(self.delay).await;
                }
                self.calls.fetch_add(1, Ordering::SeqCst);
                if self.fail_at == Some(tile) {
                    return Err(GeneratorError::SourceRead("boom".into()));
                }
                if tile.x % 2 == 1 {
                    return Ok(None);
                }
                Ok(Some(Bytes::from(tile.to_string())))
            })
        }
    }

    type WrittenTiles = Arc<Mutex<Vec<(TileCoord, Vec<u8>)>>>;

    #[derive(Default)]
    struct MemWriter {
        tiles: WrittenTiles,
        finished: Arc<Mutex<bool>>,
        aborted: Arc<Mutex<bool>>,
    }

    impl TileWriter for MemWriter {
        fn write_tile(&mut self, tile: TileCoord, data: &[u8]) -> mbtiles_writer::Result<()> {
            self.tiles.lock().unwrap().push((tile, data.to_vec()));
            Ok(())
        }
        fn finish(&mut self) -> mbtiles_writer::Result<WriterStats> {
            *self.finished.lock().unwrap() = true;
            let t = self.tiles.lock().unwrap();
            Ok(WriterStats { tiles: t.len() as u64, bytes: t.iter().map(|(_, d)| d.len() as u64).sum() })
        }
        fn abort(&mut self) -> mbtiles_writer::Result<()> {
            *self.aborted.lock().unwrap() = true;
            Ok(())
        }
    }

    fn world() -> (SelectionArea, ZoomRange, u64) {
        let area = SelectionArea::from_bbox(-180.0, -85.0, 180.0, 85.0).unwrap();
        let range = ZoomRange::new(0, 4).unwrap();
        let total = tile_selector::count_tiles(&area, range).total;
        (area, range, total)
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn writes_every_present_tile_exactly_once() {
        let (area, range, total) = world();
        let calls = Arc::new(AtomicU64::new(0));
        let producers: Vec<Box<dyn TileProducer>> = (0..3)
            .map(|_| Box::new(FakeProducer { calls: calls.clone(), fail_at: None, delay: Duration::ZERO }) as Box<_>)
            .collect();
        let writer = MemWriter::default();
        let tiles = writer.tiles.clone();
        let finished = writer.finished.clone();
        let reporter = Arc::new(MemoryReporter::default());
        let out = run_pipeline(
            PipelinePlan { area, range, total },
            producers,
            Box::new(writer),
            reporter.clone(),
            CancelToken::new(),
            PipelineConfig { queue_depth: 8, progress_interval: Duration::ZERO },
        )
        .await
        .unwrap();

        assert_eq!(calls.load(Ordering::SeqCst), total);
        assert_eq!(out.processed, total);
        let written = tiles.lock().unwrap();
        assert_eq!(out.tiles as usize, written.len());
        assert!(written.iter().all(|(t, _)| t.x % 2 == 0));
        let unique: std::collections::HashSet<_> = written.iter().map(|(t, _)| *t).collect();
        assert_eq!(unique.len(), written.len());
        assert!(*finished.lock().unwrap());

        let msgs = reporter.snapshot();
        assert!(matches!(msgs.first(), Some(Message::Started { total_tiles }) if *total_tiles == total));
        assert!(matches!(msgs.last(), Some(Message::Packaging)));
        let last_progress = msgs.iter().rev().find_map(|m| match m {
            Message::Progress { completed, total, .. } => Some((*completed, *total)),
            _ => None,
        });
        assert_eq!(last_progress, Some((total, total)));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn producer_error_aborts_writer() {
        let (area, range, total) = world();
        let calls = Arc::new(AtomicU64::new(0));
        let producers: Vec<Box<dyn TileProducer>> = vec![Box::new(FakeProducer {
            calls: calls.clone(),
            fail_at: Some(TileCoord::new(2, 0, 0)),
            delay: Duration::ZERO,
        })];
        let writer = MemWriter::default();
        let aborted = writer.aborted.clone();
        let finished = writer.finished.clone();
        let err = run_pipeline(
            PipelinePlan { area, range, total },
            producers,
            Box::new(writer),
            Arc::new(MemoryReporter::default()),
            CancelToken::new(),
            PipelineConfig::default(),
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), "SOURCE_READ_ERROR");
        assert!(*aborted.lock().unwrap());
        assert!(!*finished.lock().unwrap());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn cancellation_stops_early_and_aborts() {
        let (area, range, total) = world();
        let calls = Arc::new(AtomicU64::new(0));
        let producers: Vec<Box<dyn TileProducer>> =
            vec![Box::new(FakeProducer { calls: calls.clone(), fail_at: None, delay: Duration::from_millis(5) })];
        let writer = MemWriter::default();
        let aborted = writer.aborted.clone();
        let cancel = CancelToken::new();
        let c2 = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(60)).await;
            c2.cancel();
        });
        let err = run_pipeline(
            PipelinePlan { area, range, total },
            producers,
            Box::new(writer),
            Arc::new(MemoryReporter::default()),
            cancel,
            PipelineConfig::default(),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, GeneratorError::Cancelled));
        assert!(calls.load(Ordering::SeqCst) < total);
        assert!(*aborted.lock().unwrap());
    }
}

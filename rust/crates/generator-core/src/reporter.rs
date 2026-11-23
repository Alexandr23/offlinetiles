//! Progress reporting over stdout as JSON lines.
//!
//! stdout is reserved exclusively for protocol messages; anything human
//! readable goes to stderr. Progress is rate-limited so a fast export with
//! millions of tiles does not flood the parent process.

use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::protocol::Message;

/// Receives protocol messages. Implemented for stdout and for in-memory test sinks.
pub trait Reporter: Send + Sync {
    fn emit(&self, message: &Message);
}

/// Writes one JSON object per line to stdout and flushes immediately.
#[derive(Default)]
pub struct StdoutReporter {
    lock: Mutex<()>,
}

impl Reporter for StdoutReporter {
    fn emit(&self, message: &Message) {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let mut out = std::io::stdout().lock();
        if let Ok(line) = serde_json::to_string(message) {
            let _ = out.write_all(line.as_bytes());
            let _ = out.write_all(b"\n");
            let _ = out.flush();
        }
    }
}

/// Collects messages in memory (tests).
#[derive(Default)]
pub struct MemoryReporter {
    pub messages: Mutex<Vec<Message>>,
}

impl MemoryReporter {
    pub fn snapshot(&self) -> Vec<Message> {
        self.messages.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }
}

impl Reporter for MemoryReporter {
    fn emit(&self, message: &Message) {
        self.messages.lock().unwrap_or_else(|p| p.into_inner()).push(message.clone());
    }
}

/// Tracks counters and emits throttled `progress` messages.
pub struct ProgressTracker {
    reporter: Arc<dyn Reporter>,
    total: u64,
    started: Instant,
    last_emit: Instant,
    min_interval: Duration,
    pub completed: u64,
    pub written: u64,
    pub bytes: u64,
}

impl ProgressTracker {
    pub fn new(reporter: Arc<dyn Reporter>, total: u64, min_interval: Duration) -> Self {
        let now = Instant::now();
        Self { reporter, total, started: now, last_emit: now, min_interval, completed: 0, written: 0, bytes: 0 }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Record one processed tile. `bytes == None` means the tile was missing in the source.
    pub fn record(&mut self, bytes: Option<usize>) {
        self.completed += 1;
        if let Some(b) = bytes {
            self.written += 1;
            self.bytes += b as u64;
        }
        if self.last_emit.elapsed() >= self.min_interval || self.completed == self.total {
            self.flush();
        }
    }

    pub fn flush(&mut self) {
        self.last_emit = Instant::now();
        self.reporter.emit(&Message::Progress {
            completed: self.completed,
            total: self.total,
            bytes: self.bytes,
            elapsed_ms: self.elapsed_ms(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn throttles_but_always_emits_final() {
        let r = Arc::new(MemoryReporter::default());
        let mut p = ProgressTracker::new(r.clone(), 1000, Duration::from_secs(3600));
        for _ in 0..1000 {
            p.record(Some(10));
        }
        let msgs = r.snapshot();
        assert_eq!(msgs.len(), 1);
        assert!(matches!(msgs[0], Message::Progress { completed: 1000, total: 1000, bytes: 10000, .. }));
    }

    #[test]
    fn missing_tiles_count_as_completed_not_written() {
        let r = Arc::new(MemoryReporter::default());
        let mut p = ProgressTracker::new(r.clone(), 2, Duration::ZERO);
        p.record(None);
        p.record(Some(5));
        assert_eq!(p.completed, 2);
        assert_eq!(p.written, 1);
        assert_eq!(p.bytes, 5);
        assert_eq!(r.snapshot().len(), 2);
    }
}

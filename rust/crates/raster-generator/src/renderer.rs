//! The [`RasterRenderer`] abstraction and its sidecar implementation.
//!
//! The MVP renderer is a Node process hosting MapLibre Native
//! (`apps/renderer`). The protocol is intentionally tiny so a different
//! renderer (another process, an FFI binding) can replace it without touching
//! the pipeline:
//!
//! ```text
//! stdin  → {"type":"init","style":{…},"source":{"path":…},"fontsDir":…,"tileSize":256}
//! stdout ← {"type":"ready",…}            | {"type":"fatal","message":…}
//! stdin  → {"type":"render","id":1,"z":…,"x":…,"y":…}
//! stdout ← {"type":"tile","id":1,"width":256,"height":256,"bytes":262144}<raw RGBA>
//!        | {"type":"error","id":1,"message":…}
//! stdin  → {"type":"shutdown"}
//! ```

use std::future::Future;
use std::pin::Pin;
use std::process::Stdio;
use std::time::Duration;

use generator_core::{GeneratorError, Result};
use serde::Deserialize;
use tile_selector::TileCoord;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};

use crate::image::RgbaImage;

pub type RenderFuture<'a> = Pin<Box<dyn Future<Output = Result<RgbaImage>> + Send + 'a>>;
pub type CloseFuture<'a> = Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

/// Renders one XYZ tile to RGBA at the configured tile size.
pub trait RasterRenderer: Send {
    fn render(&mut self, tile: TileCoord) -> RenderFuture<'_>;
    fn close(&mut self) -> CloseFuture<'_>;
}

/// Everything a renderer needs to start.
#[derive(Debug, Clone)]
pub struct RendererInit {
    pub style: serde_json::Value,
    pub source_path: String,
    pub fonts_dir: String,
    pub tile_size: u32,
}

/// Timeout for a single tile render; protects against a wedged sidecar.
pub const RENDER_TIMEOUT: Duration = Duration::from_secs(60);
/// Timeout for the sidecar to report `ready`.
pub const INIT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Reply {
    Ready {},
    Fatal {
        message: String,
    },
    Tile {
        id: u64,
        width: u32,
        height: u32,
        bytes: usize,
        #[serde(rename = "downscaleTo")]
        downscale_to: Option<u32>,
    },
    Error {
        id: Option<u64>,
        message: String,
    },
}

/// A renderer hosted in a child process speaking the line protocol above.
pub struct SidecarRenderer {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
    line: String,
}

impl std::fmt::Debug for SidecarRenderer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SidecarRenderer").field("pid", &self.child.id()).field("next_id", &self.next_id).finish()
    }
}

impl SidecarRenderer {
    /// Spawn `command` (argv array — never a shell string) and initialise it.
    pub async fn spawn(command: &[String], init: &RendererInit) -> Result<Self> {
        let (program, args) =
            command.split_first().ok_or_else(|| GeneratorError::RendererStart("renderer command is empty".into()))?;
        let mut child = Command::new(program)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| GeneratorError::RendererStart(format!("failed to spawn {program}: {e}")))?;
        let stdin = child.stdin.take().ok_or_else(|| GeneratorError::RendererStart("no stdin".into()))?;
        let stdout = child.stdout.take().ok_or_else(|| GeneratorError::RendererStart("no stdout".into()))?;
        let mut renderer =
            Self { child, stdin, stdout: BufReader::with_capacity(1 << 20, stdout), next_id: 1, line: String::new() };

        let init_msg = serde_json::json!({
            "type": "init",
            "style": init.style,
            "source": { "path": init.source_path },
            "fontsDir": init.fonts_dir,
            "tileSize": init.tile_size,
        });
        renderer.send(&init_msg).await.map_err(|e| GeneratorError::RendererStart(e.to_string()))?;
        let reply = tokio::time::timeout(INIT_TIMEOUT, renderer.read_reply())
            .await
            .map_err(|_| GeneratorError::RendererStart("timed out waiting for renderer to become ready".into()))?
            .map_err(|e| GeneratorError::RendererStart(e.to_string()))?;
        match reply {
            Reply::Ready {} => Ok(renderer),
            Reply::Fatal { message } | Reply::Error { message, .. } => {
                Err(GeneratorError::RendererStart(format!("renderer failed to initialise: {message}")))
            }
            Reply::Tile { .. } => Err(GeneratorError::RendererStart("unexpected tile reply during init".into())),
        }
    }

    async fn send(&mut self, msg: &serde_json::Value) -> Result<()> {
        let mut line = serde_json::to_vec(msg).map_err(|e| GeneratorError::Internal(e.to_string()))?;
        line.push(b'\n');
        self.stdin.write_all(&line).await.map_err(|e| GeneratorError::Render(format!("renderer stdin closed: {e}")))?;
        self.stdin.flush().await.map_err(|e| GeneratorError::Render(format!("renderer stdin flush: {e}")))?;
        Ok(())
    }

    async fn read_reply(&mut self) -> Result<Reply> {
        loop {
            self.line.clear();
            let n = self
                .stdout
                .read_line(&mut self.line)
                .await
                .map_err(|e| GeneratorError::Render(format!("renderer stdout read failed: {e}")))?;
            if n == 0 {
                let status = self.child.try_wait().ok().flatten();
                return Err(GeneratorError::Render(format!(
                    "renderer exited unexpectedly{}",
                    status.map(|s| format!(" ({s})")).unwrap_or_default()
                )));
            }
            if self.line.trim().is_empty() {
                continue;
            }
            return serde_json::from_str::<Reply>(self.line.trim())
                .map_err(|e| GeneratorError::Render(format!("bad renderer reply `{}`: {e}", self.line.trim())));
        }
    }

    async fn render_inner(&mut self, tile: TileCoord) -> Result<RgbaImage> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&serde_json::json!({ "type": "render", "id": id, "z": tile.z, "x": tile.x, "y": tile.y })).await?;
        loop {
            match self.read_reply().await? {
                Reply::Tile { id: reply_id, width, height, bytes, downscale_to } => {
                    let mut data = vec![0u8; bytes];
                    self.stdout
                        .read_exact(&mut data)
                        .await
                        .map_err(|e| GeneratorError::Render(format!("short tile payload: {e}")))?;
                    if reply_id != id {
                        // Stale reply from a previous timed-out request; skip its payload.
                        continue;
                    }
                    let img = RgbaImage::new(width, height, data)?;
                    return match downscale_to {
                        Some(target) => img.downscale_to(target),
                        None => Ok(img),
                    };
                }
                Reply::Error { id: reply_id, message } => {
                    if reply_id.is_none() || reply_id == Some(id) {
                        return Err(GeneratorError::Render(format!("tile {tile}: {message}")));
                    }
                }
                Reply::Fatal { message } => return Err(GeneratorError::Render(format!("renderer fatal: {message}"))),
                Reply::Ready {} => {}
            }
        }
    }
}

impl RasterRenderer for SidecarRenderer {
    fn render(&mut self, tile: TileCoord) -> RenderFuture<'_> {
        Box::pin(async move {
            match tokio::time::timeout(RENDER_TIMEOUT, self.render_inner(tile)).await {
                Ok(r) => r,
                Err(_) => Err(GeneratorError::Render(format!("tile {tile}: render timed out"))),
            }
        })
    }

    fn close(&mut self) -> CloseFuture<'_> {
        Box::pin(async move {
            let _ = self.send(&serde_json::json!({ "type": "shutdown" })).await;
            let _ = self.stdin.shutdown().await;
            if tokio::time::timeout(Duration::from_secs(5), self.child.wait()).await.is_err() {
                let _ = self.child.kill().await;
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fake sidecar implemented in Node (available wherever the real renderer runs).
    const FAKE_SIDECAR: &str = r#"
const rl = require('readline').createInterface({ input: process.stdin });
let size = 256;
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.type === 'init') { size = m.tileSize; process.stdout.write(JSON.stringify({ type: 'ready' }) + '\n'); }
  else if (m.type === 'render') {
    if (m.z === 9) { process.stdout.write(JSON.stringify({ type: 'error', id: m.id, message: 'nope' }) + '\n'); return; }
    const w = m.z === 0 ? 512 : size;
    const buf = Buffer.alloc(w * w * 4);
    for (let i = 0; i < buf.length; i += 4) { buf[i] = m.x; buf[i+1] = m.y; buf[i+2] = m.z; buf[i+3] = 255; }
    const header = { type: 'tile', id: m.id, width: w, height: w, bytes: buf.length };
    if (m.z === 0) header.downscaleTo = size;
    process.stdout.write(Buffer.concat([Buffer.from(JSON.stringify(header) + '\n'), buf]));
  }
  else if (m.type === 'shutdown') { process.exit(0); }
});
"#;

    fn node_available() -> bool {
        std::process::Command::new("node").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
    }

    fn init() -> RendererInit {
        RendererInit {
            style: serde_json::json!({"version": 8}),
            source_path: "/x".into(),
            fonts_dir: "/f".into(),
            tile_size: 256,
        }
    }

    #[tokio::test]
    async fn sidecar_protocol_roundtrip() {
        if !node_available() {
            eprintln!("node not available; skipping sidecar protocol test");
            return;
        }
        let cmd = vec!["node".to_string(), "-e".to_string(), FAKE_SIDECAR.to_string()];
        let mut r = SidecarRenderer::spawn(&cmd, &init()).await.unwrap();

        let img = r.render(TileCoord::new(3, 5, 2)).await.unwrap();
        assert_eq!((img.width, img.height), (256, 256));
        assert_eq!(&img.data[..4], &[5, 2, 3, 255]);

        let root = r.render(TileCoord::new(0, 0, 0)).await.unwrap();
        assert_eq!((root.width, root.height), (256, 256), "z0 is rendered at 512 and downscaled");

        let err = r.render(TileCoord::new(9, 1, 1)).await.unwrap_err();
        assert_eq!(err.code(), "RENDER_ERROR");

        // still usable after a tile error
        let again = r.render(TileCoord::new(4, 1, 1)).await.unwrap();
        assert_eq!(&again.data[..4], &[1, 1, 4, 255]);
        r.close().await;
    }

    #[tokio::test]
    async fn spawn_failure_is_renderer_start_error() {
        let cmd = vec!["/definitely/missing/renderer".to_string()];
        let err = SidecarRenderer::spawn(&cmd, &init()).await.unwrap_err();
        assert_eq!(err.code(), "RENDERER_START_FAILED");
        let err = SidecarRenderer::spawn(&[], &init()).await.unwrap_err();
        assert_eq!(err.code(), "RENDERER_START_FAILED");
    }

    #[tokio::test]
    async fn fatal_during_init_is_reported() {
        if !node_available() {
            return;
        }
        let script = r#"process.stdout.write(JSON.stringify({type:'fatal',message:'no gpu'})+'\n'); setTimeout(()=>process.exit(2), 50);"#;
        let cmd = vec!["node".to_string(), "-e".to_string(), script.to_string()];
        let err = SidecarRenderer::spawn(&cmd, &init()).await.unwrap_err();
        assert!(err.to_string().contains("no gpu"), "{err}");
    }
}

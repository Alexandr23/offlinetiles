//! End-to-end tests against the compiled `tile-generator` binary: the same
//! contract the Node worker relies on.

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use rusqlite::Connection;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_tile-generator")
}

fn make_fixture(dir: &Path, max_zoom: u8) -> String {
    let src = dir.join("fixture.pmtiles");
    let status = Command::new(bin())
        .args(["fixture", &src.to_string_lossy(), "--max-zoom", &max_zoom.to_string()])
        .status()
        .unwrap();
    assert!(status.success());
    src.to_string_lossy().into_owned()
}

fn request_json(src: &str, out: &str, min: u8, max: u8, threads: u32) -> String {
    serde_json::json!({
        "protocolVersion": 1,
        "jobId": "0f3f6a4e-1b2c-4d5e-8f90-abcdefabcdef",
        "source": { "type": "pmtiles", "path": src },
        "selection": {
            "geometry": { "type": "Polygon", "coordinates": [[[-60,-40],[60,-40],[60,40],[-60,40],[-60,-40]]] },
            "minZoom": min, "maxZoom": max
        },
        "output": {
            "content": "vector", "container": "mbtiles", "path": out,
            "metadata": { "name": "CLI test", "attribution": "© test" }
        },
        "style": null,
        "threads": threads
    })
    .to_string()
}

fn lines_of(stdout: &[u8]) -> Vec<serde_json::Value> {
    stdout
        .split(|b| *b == b'\n')
        .filter(|l| !l.is_empty())
        .map(|l| {
            serde_json::from_slice(l)
                .unwrap_or_else(|e| panic!("non-JSON stdout line {:?}: {e}", String::from_utf8_lossy(l)))
        })
        .collect()
}

#[test]
fn generate_emits_protocol_and_writes_mbtiles() {
    let dir = tempfile::tempdir().unwrap();
    let src = make_fixture(dir.path(), 6);
    let out = dir.path().join("job").join("map.mbtiles");
    let req_path = dir.path().join("request.json");
    std::fs::write(&req_path, request_json(&src, &out.to_string_lossy(), 2, 6, 2)).unwrap();

    let output = Command::new(bin()).args(["generate", &req_path.to_string_lossy()]).output().unwrap();
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));

    let msgs = lines_of(&output.stdout);
    assert_eq!(msgs.first().unwrap()["type"], "started");
    let total = msgs[0]["totalTiles"].as_u64().unwrap();
    assert!(total > 0);
    assert!(msgs.iter().any(|m| m["type"] == "progress"));
    assert!(msgs.iter().any(|m| m["type"] == "packaging"));
    let last = msgs.last().unwrap();
    assert_eq!(last["type"], "completed");
    assert_eq!(last["tiles"].as_u64().unwrap(), total);
    assert!(last["bytes"].as_u64().unwrap() > 0);

    // The order is started → progress* → packaging → completed.
    let idx = |t: &str| msgs.iter().position(|m| m["type"] == t).unwrap();
    assert!(idx("started") < idx("progress"));
    assert!(idx("progress") < idx("packaging"));

    let conn = Connection::open(&out).unwrap();
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM tiles", [], |r| r.get(0)).unwrap();
    assert_eq!(n as u64, total);
    let attribution: String =
        conn.query_row("SELECT value FROM metadata WHERE name='attribution'", [], |r| r.get(0)).unwrap();
    assert_eq!(attribution, "© test");
    assert!(!out.with_file_name("map.mbtiles.tmp").exists());
}

#[test]
fn estimate_matches_generation_count() {
    let dir = tempfile::tempdir().unwrap();
    let src = make_fixture(dir.path(), 6);
    let est_path = dir.path().join("estimate.json");
    std::fs::write(
        &est_path,
        serde_json::json!({
            "protocolVersion": 1,
            "source": { "type": "pmtiles", "path": src },
            "selection": {
                "geometry": { "type": "Polygon", "coordinates": [[[-60,-40],[60,-40],[60,40],[-60,40],[-60,-40]]] },
                "minZoom": 2, "maxZoom": 6
            },
            "sampleLimit": 50
        })
        .to_string(),
    )
    .unwrap();
    let output = Command::new(bin()).args(["estimate", &est_path.to_string_lossy()]).output().unwrap();
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    let msgs = lines_of(&output.stdout);
    assert_eq!(msgs.len(), 1);
    let est = &msgs[0];
    assert_eq!(est["type"], "estimate");
    let tiles = est["tiles"].as_u64().unwrap();
    let per_zoom: u64 = est["tilesPerZoom"].as_object().unwrap().values().map(|v| v.as_u64().unwrap()).sum();
    assert_eq!(tiles, per_zoom);
    assert_eq!(est["sampledTiles"], 50);
    assert_eq!(est["sampledPresent"], 50);
    assert!(est["sampledBytes"].as_u64().unwrap() > 0);
    assert_eq!(est["exact"], false);

    // Generation for the same selection must produce exactly `tiles`.
    let out = dir.path().join("map.mbtiles");
    let req_path = dir.path().join("request.json");
    std::fs::write(&req_path, request_json(&src, &out.to_string_lossy(), 2, 6, 1)).unwrap();
    let output = Command::new(bin()).args(["generate", &req_path.to_string_lossy()]).output().unwrap();
    let msgs = lines_of(&output.stdout);
    assert_eq!(msgs.last().unwrap()["tiles"].as_u64().unwrap(), tiles);
}

#[test]
fn invalid_request_reports_failed_message() {
    let dir = tempfile::tempdir().unwrap();
    let req_path = dir.path().join("bad.json");
    std::fs::write(&req_path, r#"{"protocolVersion": 99}"#).unwrap();
    let output = Command::new(bin()).args(["generate", &req_path.to_string_lossy()]).output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    let msgs = lines_of(&output.stdout);
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0]["type"], "failed");
    assert_eq!(msgs[0]["code"], "INVALID_REQUEST");

    let output = Command::new(bin()).args(["generate", "/no/such/file.json"]).output().unwrap();
    let msgs = lines_of(&output.stdout);
    assert_eq!(msgs[0]["code"], "INVALID_REQUEST");
}

#[test]
fn missing_source_reports_source_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("map.mbtiles");
    let req_path = dir.path().join("request.json");
    std::fs::write(&req_path, request_json("/nope.pmtiles", &out.to_string_lossy(), 0, 3, 1)).unwrap();
    let output = Command::new(bin()).args(["generate", &req_path.to_string_lossy()]).output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    let msgs = lines_of(&output.stdout);
    assert_eq!(msgs.last().unwrap()["type"], "failed");
    assert_eq!(msgs.last().unwrap()["code"], "SOURCE_UNAVAILABLE");
    assert!(!out.exists());
}

#[cfg(unix)]
#[test]
fn sigterm_cancels_and_removes_temp_output() {
    let dir = tempfile::tempdir().unwrap();
    // A large zoom range so the job runs long enough to be interrupted.
    let src = make_fixture(dir.path(), 8);
    let out = dir.path().join("map.mbtiles");
    let req_path = dir.path().join("request.json");
    std::fs::write(&req_path, request_json(&src, &out.to_string_lossy(), 0, 13, 1)).unwrap();

    let mut child = Command::new(bin())
        .args(["generate", &req_path.to_string_lossy()])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    // Wait for the first progress line, then send SIGTERM.
    let started = Instant::now();
    let mut saw_progress = false;
    let mut collected = Vec::new();
    for line in lines.by_ref() {
        let line = line.unwrap();
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        let t = v["type"].as_str().unwrap().to_string();
        collected.push(v);
        if t == "progress" && !saw_progress {
            saw_progress = true;
            unsafe {
                libc_kill(child.id() as i32);
            }
        }
        if t == "cancelled" || t == "completed" || t == "failed" {
            break;
        }
        assert!(started.elapsed() < Duration::from_secs(120), "test timed out");
    }
    let status = child.wait().unwrap();
    assert!(saw_progress, "never saw progress");
    assert_eq!(collected.last().unwrap()["type"], "cancelled", "{collected:?}");
    assert!(status.success());
    assert!(!out.exists());
    assert!(!out.with_file_name("map.mbtiles.tmp").exists());
}

#[cfg(unix)]
unsafe fn libc_kill(pid: i32) {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    const SIGTERM: i32 = 15;
    kill(pid, SIGTERM);
}

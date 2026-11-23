//! The versioned JSON boundary between the Node worker and the Rust generator.
//!
//! Request files are produced by `apps/server/src/generator/generator-protocol.ts`;
//! the shapes here must stay in lock-step with that file. Any incompatible
//! change bumps [`PROTOCOL_VERSION`] on both sides.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("request is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unsupported protocolVersion {0} (expected {PROTOCOL_VERSION})")]
    Version(u32),
    #[error("invalid request: {0}")]
    Invalid(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Content {
    Vector,
    Raster,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Container {
    Mbtiles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RasterFormat {
    Png,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase", tag = "type")]
pub enum SourceSpec {
    Pmtiles { path: String },
}

impl SourceSpec {
    pub fn path(&self) -> &str {
        match self {
            SourceSpec::Pmtiles { path } => path,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSpec {
    pub geometry: serde_json::Value,
    pub min_zoom: u8,
    pub max_zoom: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputMetadata {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attribution: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputSpec {
    pub content: Content,
    pub container: Container,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raster_format: Option<RasterFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tile_size: Option<u32>,
    pub metadata: OutputMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererSpec {
    pub command: Vec<String>,
    pub fonts_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub protocol_version: u32,
    pub job_id: String,
    pub source: SourceSpec,
    pub selection: SelectionSpec,
    pub output: OutputSpec,
    #[serde(default)]
    pub style: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renderer: Option<RendererSpec>,
    #[serde(default)]
    pub threads: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateRequest {
    pub protocol_version: u32,
    pub source: SourceSpec,
    pub selection: SelectionSpec,
    #[serde(default)]
    pub sample_limit: u64,
}

fn check_version(v: u32) -> Result<(), ProtocolError> {
    if v == PROTOCOL_VERSION {
        Ok(())
    } else {
        Err(ProtocolError::Version(v))
    }
}

fn check_selection(s: &SelectionSpec) -> Result<(), ProtocolError> {
    if s.min_zoom > s.max_zoom {
        return Err(ProtocolError::Invalid(format!("minZoom {} > maxZoom {}", s.min_zoom, s.max_zoom)));
    }
    if s.max_zoom > tile_selector::MAX_SUPPORTED_ZOOM {
        return Err(ProtocolError::Invalid(format!("maxZoom {} exceeds supported maximum", s.max_zoom)));
    }
    Ok(())
}

impl GenerateRequest {
    pub fn parse(json: &str) -> Result<Self, ProtocolError> {
        let req: Self = serde_json::from_str(json)?;
        req.validate()?;
        Ok(req)
    }

    pub fn validate(&self) -> Result<(), ProtocolError> {
        check_version(self.protocol_version)?;
        check_selection(&self.selection)?;
        if self.job_id.trim().is_empty() {
            return Err(ProtocolError::Invalid("jobId is empty".into()));
        }
        if self.output.path.trim().is_empty() {
            return Err(ProtocolError::Invalid("output.path is empty".into()));
        }
        if self.output.metadata.name.trim().is_empty() {
            return Err(ProtocolError::Invalid("output.metadata.name is empty".into()));
        }
        if self.output.content == Content::Raster {
            if self.style.is_none() {
                return Err(ProtocolError::Invalid("raster output requires a style".into()));
            }
            match self.renderer {
                None => return Err(ProtocolError::Invalid("raster output requires renderer settings".into())),
                Some(ref r) if r.command.is_empty() => {
                    return Err(ProtocolError::Invalid("renderer.command is empty".into()))
                }
                _ => {}
            }
            if let Some(size) = self.output.tile_size {
                if size != 256 && size != 512 {
                    return Err(ProtocolError::Invalid(format!("tileSize {size} must be 256 or 512")));
                }
            }
        }
        Ok(())
    }

    /// Worker count: `threads == 0` means "auto" (available parallelism − 1, min 1).
    pub fn effective_threads(&self) -> usize {
        if self.threads > 0 {
            self.threads as usize
        } else {
            std::thread::available_parallelism().map(|n| n.get().saturating_sub(1).max(1)).unwrap_or(1)
        }
    }

    pub fn tile_size(&self) -> u32 {
        self.output.tile_size.unwrap_or(256)
    }
}

impl EstimateRequest {
    pub fn parse(json: &str) -> Result<Self, ProtocolError> {
        let req: Self = serde_json::from_str(json)?;
        check_version(req.protocol_version)?;
        check_selection(&req.selection)?;
        Ok(req)
    }
}

// ---- stdout messages ----------------------------------------------------------------------

/// JSON-lines messages written to stdout during `generate`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum Message {
    Started { total_tiles: u64 },
    Progress { completed: u64, total: u64, bytes: u64, elapsed_ms: u64 },
    Packaging,
    Completed { tiles: u64, bytes: u64, elapsed_ms: u64 },
    Failed { code: String, message: String },
    Cancelled,
}

/// Result line written by `estimate`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", rename = "estimate")]
pub struct EstimateResult {
    pub tiles: u64,
    pub tiles_per_zoom: BTreeMap<String, u64>,
    pub sampled_tiles: u64,
    pub sampled_bytes: u64,
    pub sampled_present: u64,
    pub exact: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    const REQUEST: &str = r#"{
      "protocolVersion": 1,
      "jobId": "4b6b2d7e-7a1a-4b4e-9b3f-1b2c3d4e5f60",
      "source": { "type": "pmtiles", "path": "/data/master/master.pmtiles" },
      "selection": {
        "geometry": { "type": "Polygon", "coordinates": [[[7.4,43.7],[7.45,43.7],[7.45,43.75],[7.4,43.75],[7.4,43.7]]] },
        "minZoom": 0, "maxZoom": 14
      },
      "output": {
        "content": "vector", "container": "mbtiles", "path": "/data/exports/x/map.mbtiles",
        "metadata": { "name": "Monaco", "attribution": "© OSM" }
      },
      "style": null,
      "threads": 0
    }"#;

    #[test]
    fn parses_vector_request() {
        let r = GenerateRequest::parse(REQUEST).unwrap();
        assert_eq!(r.output.content, Content::Vector);
        assert_eq!(r.source.path(), "/data/master/master.pmtiles");
        assert_eq!(r.selection.max_zoom, 14);
        assert!(r.style.is_none());
        assert!(r.effective_threads() >= 1);
    }

    #[test]
    fn rejects_wrong_version_and_bad_zooms() {
        let bad = REQUEST.replace("\"protocolVersion\": 1", "\"protocolVersion\": 2");
        assert!(matches!(GenerateRequest::parse(&bad), Err(ProtocolError::Version(2))));
        let bad = REQUEST.replace("\"minZoom\": 0", "\"minZoom\": 15");
        assert!(matches!(GenerateRequest::parse(&bad), Err(ProtocolError::Invalid(_))));
    }

    #[test]
    fn raster_requires_style_and_renderer() {
        let raster = REQUEST.replace("\"content\": \"vector\"", "\"content\": \"raster\"");
        assert!(GenerateRequest::parse(&raster).is_err());
        let with_style = raster.replace("\"style\": null", "\"style\": {\"version\":8,\"layers\":[],\"sources\":{}}");
        assert!(GenerateRequest::parse(&with_style).is_err());
        let full = with_style.replace(
            "\"threads\": 0",
            "\"threads\": 2, \"renderer\": {\"command\": [\"node\", \"r.js\"], \"fontsDir\": \"/fonts\"}",
        );
        let r = GenerateRequest::parse(&full).unwrap();
        assert_eq!(r.effective_threads(), 2);
        assert_eq!(r.tile_size(), 256);
    }

    #[test]
    fn messages_serialize_like_node_expects() {
        let s =
            serde_json::to_string(&Message::Progress { completed: 3, total: 10, bytes: 42, elapsed_ms: 7 }).unwrap();
        assert_eq!(s, r#"{"type":"progress","completed":3,"total":10,"bytes":42,"elapsedMs":7}"#);
        let s = serde_json::to_string(&Message::Started { total_tiles: 9 }).unwrap();
        assert_eq!(s, r#"{"type":"started","totalTiles":9}"#);
        let s = serde_json::to_string(&Message::Cancelled).unwrap();
        assert_eq!(s, r#"{"type":"cancelled"}"#);
        let e = EstimateResult {
            tiles: 5,
            tiles_per_zoom: BTreeMap::from([("0".into(), 1), ("1".into(), 4)]),
            sampled_tiles: 2,
            sampled_bytes: 100,
            sampled_present: 2,
            exact: true,
        };
        let s = serde_json::to_string(&e).unwrap();
        assert!(s.starts_with(r#"{"type":"estimate","tiles":5,"tilesPerZoom":{"0":1,"1":4}"#), "{s}");
    }

    #[test]
    fn estimate_request_parses() {
        let json = r#"{"protocolVersion":1,"source":{"type":"pmtiles","path":"/m.pmtiles"},
          "selection":{"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]},"minZoom":2,"maxZoom":5},
          "sampleLimit":100}"#;
        let r = EstimateRequest::parse(json).unwrap();
        assert_eq!(r.sample_limit, 100);
    }
}

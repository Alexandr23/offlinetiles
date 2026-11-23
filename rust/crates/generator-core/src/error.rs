//! Error type with stable machine-readable codes.
//!
//! The `code` is what the Node worker persists in `generations.error_code`
//! and what the UI uses to pick a human message; the `message` is diagnostic.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum GeneratorError {
    #[error("{0}")]
    Protocol(#[from] crate::protocol::ProtocolError),
    #[error("selection geometry is invalid: {0}")]
    Selection(#[from] tile_selector::GeometryError),
    #[error("zoom range is invalid: {0}")]
    ZoomRange(#[from] tile_selector::SelectionError),
    #[error("source archive unavailable: {0}")]
    SourceUnavailable(String),
    #[error("source read failed: {0}")]
    SourceRead(String),
    #[error("output write failed: {0}")]
    OutputWrite(#[from] mbtiles_writer::WriterError),
    #[error("renderer failed to start: {0}")]
    RendererStart(String),
    #[error("render failed: {0}")]
    Render(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("internal error: {0}")]
    Internal(String),
    #[error("cancelled")]
    Cancelled,
}

impl GeneratorError {
    /// Stable error code reported to the worker.
    pub fn code(&self) -> &'static str {
        match self {
            GeneratorError::Protocol(_) => "INVALID_REQUEST",
            GeneratorError::Selection(_) => "INVALID_SELECTION",
            GeneratorError::ZoomRange(tile_selector::SelectionError::LimitExceeded { .. }) => "TOO_MANY_TILES",
            GeneratorError::ZoomRange(_) => "INVALID_ZOOM_RANGE",
            GeneratorError::SourceUnavailable(_) => "SOURCE_UNAVAILABLE",
            GeneratorError::SourceRead(_) => "SOURCE_READ_ERROR",
            GeneratorError::OutputWrite(_) => "OUTPUT_WRITE_ERROR",
            GeneratorError::RendererStart(_) => "RENDERER_START_FAILED",
            GeneratorError::Render(_) => "RENDER_ERROR",
            GeneratorError::Io(_) => "IO_ERROR",
            GeneratorError::Internal(_) => "INTERNAL_ERROR",
            GeneratorError::Cancelled => "CANCELLED",
        }
    }
}

impl From<pmtiles_source::SourceError> for GeneratorError {
    fn from(e: pmtiles_source::SourceError) -> Self {
        match e {
            pmtiles_source::SourceError::Open { .. } | pmtiles_source::SourceError::NotVector(_) => {
                GeneratorError::SourceUnavailable(e.to_string())
            }
            other => GeneratorError::SourceRead(other.to_string()),
        }
    }
}

pub type Result<T> = std::result::Result<T, GeneratorError>;

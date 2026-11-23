//! Core of the tile generator: request protocol, cancellation, progress
//! reporting, estimates and the generic producer → writer pipeline.
//!
//! Content-specific producers live in `vector-generator` and
//! `raster-generator`; the CLI wires everything together.

pub mod cancel;
pub mod error;
pub mod estimate;
pub mod job;
pub mod pipeline;
pub mod protocol;
pub mod reporter;

pub use cancel::CancelToken;
pub use error::{GeneratorError, Result};
pub use pipeline::{
    run_pipeline, PipelineConfig, PipelineOutcome, PipelinePlan, ProduceFuture, ShutdownFuture, TileProducer,
};
pub use protocol::{Content, EstimateRequest, EstimateResult, GenerateRequest, Message, PROTOCOL_VERSION};
pub use reporter::{MemoryReporter, Reporter, StdoutReporter};

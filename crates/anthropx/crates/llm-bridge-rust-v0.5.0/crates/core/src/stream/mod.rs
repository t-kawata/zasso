//! Streaming protocol transformation.
//!
//! Two-layer architecture per spec [10 4.1]:
//! 1. SSE framing parser: extracts `event:` and `data:` lines from raw SSE
//! 2. Provider payload parser: interprets the `data:` payload per provider

// Streaming structs are naturally long and have unused fields from deserialization.
#![allow(clippy::too_many_lines, dead_code)]
// Streaming module has many small helpers; pedantic lints are too noisy here.
#![allow(
    clippy::must_use_candidate,
    clippy::map_entry,
    clippy::if_not_else,
    clippy::collapsible_if,
    clippy::needless_update,
    clippy::match_same_arms,
    clippy::uninlined_format_args,
    clippy::unnecessary_wraps
)]

mod anthropic_to_openai;
mod anthropic_to_responses;
mod anthropic_types;
mod frame_dispatch;
mod openai_stream;
mod openai_to_responses;
mod openai_types;
mod responses_to_anthropic_stream;
mod sse_output;
mod sse_parser;
mod stream_helpers;
#[cfg(test)]
mod tests;

// ---------------------------------------------------------------------------
// Public re-exports — the API surface must remain unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Re-export model types used by the public API so downstream code can
// continue to import them from `crate::stream::*`.
// ---------------------------------------------------------------------------
pub(crate) use anthropic_to_openai::transform_anthropic_stream_to_openai;
pub(crate) use anthropic_to_responses::transform_anthropic_stream_to_openai_responses;
pub(crate) use openai_stream::transform_openai_stream;
pub(crate) use openai_to_responses::transform_openai_stream_to_responses;
pub(crate) use responses_to_anthropic_stream::transform_responses_stream_to_anthropic;
pub use sse_output::events_to_sse;
pub(crate) use sse_output::{anthropic_sse_frames_to_events, passthrough_anthropic_stream};
pub use sse_parser::{SseFrame, parse_sse_frames};
#[allow(unused_imports)]
pub(crate) use stream_helpers::SYNTHETIC_THINKING_SIGNATURE;

use crate::model::{ApiFormat, StreamEvent, StreamState, TransformError};

// ---------------------------------------------------------------------------
// Stream transform — public API
// ---------------------------------------------------------------------------

/// Transform upstream SSE events into canonical Anthropic SSE event stream.
///
/// Accepts raw SSE bytes from any supported provider and returns a vector of
/// Anthropic-compatible `StreamEvent`s.
///
/// # Errors
///
/// Returns `TransformError::StreamInterrupted` if the stream ends unexpectedly,
/// `TransformError::InvalidFormat` if payloads cannot be parsed, or
/// `TransformError::BufferLimitExceeded` if the stream buffer limit is hit.
pub fn transform_stream_events(
    upstream_sse: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<StreamEvent>, TransformError> {
    let frames = parse_sse_frames(upstream_sse);

    if frames.is_empty() {
        return Ok(Vec::new());
    }

    // Enforce total buffer limit before processing (prevents memory exhaustion).
    let total_bytes: usize = frames.iter().map(|f| f.data.len()).sum();
    if total_bytes > crate::model::MAX_SSE_STREAM_BYTES {
        return Err(TransformError::BufferLimitExceeded(format!(
            "SSE stream size {total_bytes} bytes exceeds {} byte limit",
            crate::model::MAX_SSE_STREAM_BYTES
        )));
    }

    match source {
        ApiFormat::OpenaiChat => transform_openai_stream(&frames, state),
        ApiFormat::AnthropicMessages => passthrough_anthropic_stream(&frames, state),
        ApiFormat::OpenaiResponses => {
            // Responses SSE → Anthropic SSE → parse SSE frames → StreamEvent
            let bytes = transform_responses_stream_to_anthropic(&frames, state)?;
            let anthro_frames = parse_sse_frames(&bytes);
            anthropic_sse_frames_to_events(&anthro_frames, state)
        }
    }
}

/// Transform upstream SSE bytes into `OpenAI` Chat Completions SSE bytes.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the upstream SSE payload cannot be
/// parsed or if the source format is unsupported for `OpenAI` serialization.
pub fn transform_stream_to_openai_sse(
    upstream_sse: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    let frames = parse_sse_frames(upstream_sse);

    if frames.is_empty() {
        return Ok(Vec::new());
    }

    match source {
        ApiFormat::AnthropicMessages => transform_anthropic_stream_to_openai(&frames, state),
        ApiFormat::OpenaiChat => Err(TransformError::InvalidFormat(
            "OpenAI -> OpenAI passthrough is handled outside core transform".to_string(),
        )),
        ApiFormat::OpenaiResponses => Err(TransformError::InvalidFormat(
            "OpenAI Responses -> OpenAI Responses passthrough is handled outside core transform"
                .to_string(),
        )),
    }
}

/// Transform upstream SSE bytes into `OpenAI` Responses SSE bytes.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the upstream SSE payload cannot be
/// parsed or if the source format is unsupported for Responses serialization.
pub fn transform_stream_to_openai_responses_sse(
    upstream_sse: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    let frames = parse_sse_frames(upstream_sse);

    if frames.is_empty() {
        return Ok(Vec::new());
    }

    match source {
        ApiFormat::AnthropicMessages => {
            transform_anthropic_stream_to_openai_responses(&frames, state)
        }
        ApiFormat::OpenaiChat => transform_openai_stream_to_responses(&frames, state),
        ApiFormat::OpenaiResponses => Err(TransformError::InvalidFormat(
            "OpenAI Responses -> OpenAI Responses passthrough is handled outside core transform"
                .to_string(),
        )),
    }
}

/// Transform upstream SSE bytes into Anthropic Messages SSE bytes.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the upstream SSE payload cannot be
/// parsed or if the source format is unsupported for Anthropic serialization.
pub fn transform_stream_to_anthropic_sse(
    upstream_sse: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    let frames = parse_sse_frames(upstream_sse);

    if frames.is_empty() {
        return Ok(Vec::new());
    }

    match source {
        ApiFormat::OpenaiChat => Ok(events_to_sse(&transform_openai_stream(&frames, state)?)),
        ApiFormat::OpenaiResponses => transform_responses_stream_to_anthropic(&frames, state),
        ApiFormat::AnthropicMessages => Err(TransformError::InvalidFormat(
            "Anthropic -> Anthropic passthrough is handled outside core transform".to_string(),
        )),
    }
}

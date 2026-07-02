//! Streaming transform entry points.
//!
//! Thin delegates to `crate::stream::*` for protocol transformation of SSE streams.

use crate::model::{ApiFormat, StreamState, TransformError};

/// Entry point for streaming protocol transformation.
///
/// Takes an upstream SSE stream and produces a canonical Anthropic SSE event
/// sequence. The `state` parameter owns per-connection state exclusively.
///
/// Delegates to the stream module for SSE parsing and provider-specific conversion.
///
/// # Errors
///
/// Returns `TransformError` on stream parsing failures or buffer limits.
pub fn transform_stream(
    upstream_events: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    // Enforce total SSE stream buffer limit before processing.
    if upstream_events.len() > crate::model::MAX_SSE_STREAM_BYTES {
        return Err(TransformError::BufferLimitExceeded(format!(
            "SSE stream size {} bytes exceeds {} byte limit",
            upstream_events.len(),
            crate::model::MAX_SSE_STREAM_BYTES
        )));
    }

    let events = crate::stream::transform_stream_events(upstream_events, source, state)?;
    Ok(crate::stream::events_to_sse(&events))
}

/// Entry point for streaming protocol transformation with an `OpenAI` SSE target.
///
/// # Errors
///
/// Returns `TransformError` on stream parsing or serialization failures.
pub fn transform_stream_to_openai(
    upstream_events: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    // Enforce total SSE stream buffer limit before processing.
    if upstream_events.len() > crate::model::MAX_SSE_STREAM_BYTES {
        return Err(TransformError::BufferLimitExceeded(format!(
            "SSE stream size {} bytes exceeds {} byte limit",
            upstream_events.len(),
            crate::model::MAX_SSE_STREAM_BYTES
        )));
    }

    crate::stream::transform_stream_to_openai_sse(upstream_events, source, state)
}

/// Entry point for streaming protocol transformation with an `OpenAI` Responses SSE target.
///
/// # Errors
///
/// Returns `TransformError` on stream parsing or serialization failures.
pub fn transform_stream_to_openai_responses(
    upstream_events: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    // Enforce total SSE stream buffer limit before processing.
    if upstream_events.len() > crate::model::MAX_SSE_STREAM_BYTES {
        return Err(TransformError::BufferLimitExceeded(format!(
            "SSE stream size {} bytes exceeds {} byte limit",
            upstream_events.len(),
            crate::model::MAX_SSE_STREAM_BYTES
        )));
    }

    crate::stream::transform_stream_to_openai_responses_sse(upstream_events, source, state)
}

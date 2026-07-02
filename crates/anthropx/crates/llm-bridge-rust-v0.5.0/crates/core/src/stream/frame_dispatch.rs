//! Common Anthropic SSE frame iteration logic.
//!
//! Both `transform_anthropic_stream_to_openai` and
//! `transform_anthropic_stream_to_openai_responses` share the same outer
//! frame-dispatch loop: parse JSON, resolve the event type, skip pings /
//! unknown, and handle `[DONE]`.  This helper centralizes that pattern so
//! each transform only implements the per-event-type match arms.

use super::SseFrame;
use crate::model::TransformError;

/// A parsed Anthropic SSE event ready for dispatch.
pub(crate) enum ParsedAnthropicEvent {
    /// The frame was `[DONE]` — mark finished and emit terminator.
    Done,
    /// A normal event with its type string and parsed JSON payload.
    Event {
        event_type: String,
        payload: serde_json::Value,
    },
}

/// Iterate over raw SSE frames and yield parsed Anthropic events.
///
/// Handles empty-frame skipping, `[DONE]` detection, JSON parsing, and
/// event-type resolution (falls back to the `"type"` field in the JSON
/// when the SSE `event:` header is absent).
pub(crate) fn parse_anthropic_stream_frames<'a>(
    frames: impl IntoIterator<Item = &'a SseFrame>,
) -> impl Iterator<Item = Result<ParsedAnthropicEvent, TransformError>> {
    frames.into_iter().filter_map(|frame| {
        let data = frame.data.trim();
        if data.is_empty() {
            return None;
        }
        if data == "[DONE]" {
            return Some(Ok(ParsedAnthropicEvent::Done));
        }

        let payload: serde_json::Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(e) => {
                return Some(Err(TransformError::InvalidFormat(format!(
                    "Anthropic chunk parse: {e}"
                ))));
            }
        };

        let payload_type = payload
            .get("type")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned);
        let event_type = match frame.event.as_deref().or(payload_type.as_deref()) {
            Some(t) => t.to_owned(),
            None => {
                return Some(Err(TransformError::MissingRequiredField(
                    "stream event type".to_string(),
                )));
            }
        };

        Some(Ok(ParsedAnthropicEvent::Event {
            event_type,
            payload,
        }))
    })
}

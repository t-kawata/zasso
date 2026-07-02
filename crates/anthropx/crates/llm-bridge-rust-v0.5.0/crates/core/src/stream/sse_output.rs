//! SSE output serialization and Anthropic passthrough.

use serde_json::json;

use crate::model::{StopReason, StreamDelta, StreamEvent, StreamState, TransformError};

/// Serialize a list of `StreamEvent` into raw SSE bytes for the wire.
pub fn events_to_sse(events: &[StreamEvent]) -> Vec<u8> {
    let mut out = Vec::with_capacity(1024);

    for event in events {
        let (event_type, payload) = match event {
            StreamEvent::MessageStart {
                role,
                message_id,
                model,
                usage,
            } => (
                "message_start",
                json!({
                    "type": "message_start",
                    "message": {
                        "id": message_id,
                        "type": "message",
                        "role": role,
                        "content": [],
                        "model": model,
                        "stop_reason": serde_json::Value::Null,
                        "stop_sequence": serde_json::Value::Null,
                        "usage": usage,
                    },
                }),
            ),
            StreamEvent::ContentBlockStart {
                index,
                content_block,
            } => {
                let cb = content_block_to_json(content_block);
                (
                    "content_block_start",
                    json!({
                        "type": "content_block_start",
                        "index": index,
                        "content_block": cb,
                    }),
                )
            }
            StreamEvent::ContentBlockDelta { index, delta } => (
                "content_block_delta",
                json!({
                    "type": "content_block_delta",
                    "index": index,
                    "delta": stream_delta_to_json(delta),
                }),
            ),
            StreamEvent::ContentBlockStop { index } => (
                "content_block_stop",
                json!({ "type": "content_block_stop", "index": index }),
            ),
            StreamEvent::MessageDelta {
                stop_reason,
                stop_sequence,
                usage,
            } => (
                "message_delta",
                json!({
                    "type": "message_delta",
                    "delta": {
                        "stop_reason": stop_reason.map(stop_reason_to_string),
                        "stop_sequence": stop_sequence,
                    },
                    "usage": {
                        "output_tokens": usage.output_tokens,
                        "cache_read_input_tokens": usage.cache_read_input_tokens,
                        "cache_creation_input_tokens": usage.cache_creation_input_tokens,
                    },
                }),
            ),
            StreamEvent::MessageStop => ("message_stop", json!({ "type": "message_stop" })),
            StreamEvent::Error {
                error_type,
                message,
            } => (
                "error",
                json!({
                    "type": "error",
                    "error": {
                        "type": error_type,
                        "message": message,
                    },
                }),
            ),
        };

        out.extend_from_slice(b"event: ");
        out.extend_from_slice(event_type.as_bytes());
        out.push(b'\n');
        let data_str = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
        out.extend_from_slice(b"data: ");
        out.extend_from_slice(data_str.as_bytes());
        out.push(b'\n');
        out.push(b'\n');
    }

    out
}

fn stream_delta_to_json(delta: &StreamDelta) -> serde_json::Value {
    match delta {
        StreamDelta::Text { text } => json!({ "type": "text_delta", "text": text }),
        StreamDelta::Thinking { thinking } => {
            json!({ "type": "thinking_delta", "thinking": thinking })
        }
        StreamDelta::Signature { signature } => {
            json!({ "type": "signature_delta", "signature": signature })
        }
        StreamDelta::InputJson { partial_json } => {
            json!({ "type": "input_json_delta", "partial_json": partial_json })
        }
    }
}

fn content_block_to_json(block: &crate::model::ContentBlock) -> serde_json::Value {
    match block {
        crate::model::ContentBlock::Text { text } => {
            json!({ "type": "text", "text": text })
        }
        crate::model::ContentBlock::ToolUse { id, name, input } => {
            json!({
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": input,
            })
        }
        crate::model::ContentBlock::Image { source: _ } => {
            json!({ "type": "image" })
        }
        crate::model::ContentBlock::ToolResult {
            tool_use_id,
            content: _,
        } => {
            json!({ "type": "tool_result", "tool_use_id": tool_use_id })
        }
        crate::model::ContentBlock::Thinking { text, usage } => {
            json!({ "type": "thinking", "thinking": text, "usage": usage })
        }
    }
}

pub(crate) fn stop_reason_to_string(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end_turn",
        StopReason::MaxTokens => "max_tokens",
        StopReason::ToolUse => "tool_use",
        StopReason::StopSequence => "stop_sequence",
        StopReason::ContentFilter => "content_filter",
    }
}

pub(crate) fn map_anthropic_stop_reason_to_openai_finish_reason(
    stop_reason: Option<&str>,
    stop_sequence: Option<&str>,
) -> Option<&'static str> {
    match (stop_reason, stop_sequence) {
        (Some("end_turn" | "stop_sequence"), _) | (None, Some(_)) => Some("stop"),
        (Some("max_tokens"), _) => Some("length"),
        (Some("tool_use"), _) => Some("tool_calls"),
        (Some("content_filter"), _) => Some("content_filter"),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Anthropic passthrough
// ---------------------------------------------------------------------------

/// Passthrough for Anthropic → Anthropic streaming.
///
/// Returns an error because Anthropic → Anthropic passthrough is handled
/// outside the core transform layer (the proxy forwards raw bytes directly).
/// This function exists only as a placeholder for the transform dispatch table.
pub(crate) fn passthrough_anthropic_stream(
    _frames: &[super::SseFrame],
    _state: &mut StreamState,
) -> Result<Vec<StreamEvent>, TransformError> {
    Err(TransformError::InvalidFormat(
        "Anthropic→Anthropic passthrough handled outside core transform".to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Anthropic SSE frames → StreamEvent parsing
// ---------------------------------------------------------------------------

/// Parse Anthropic SSE frames into canonical `StreamEvent`s.
pub(crate) fn anthropic_sse_frames_to_events(
    frames: &[super::SseFrame],
    state: &mut StreamState,
) -> Result<Vec<StreamEvent>, TransformError> {
    let mut events: Vec<StreamEvent> = Vec::new();

    for frame in frames {
        let value: serde_json::Value = serde_json::from_str(&frame.data)
            .map_err(|e| TransformError::InvalidFormat(format!("Anthropic SSE data parse: {e}")))?;

        let event_type = frame
            .event
            .as_deref()
            .or_else(|| value.get("type").and_then(|v| v.as_str()))
            .unwrap_or("");

        match event_type {
            "message_start" => {
                if let Some(msg) = value.get("message") {
                    if let Some(id) = msg.get("id").and_then(|v| v.as_str()) {
                        state.message_id = Some(id.to_string());
                    }
                    if let Some(model) = msg.get("model").and_then(|v| v.as_str()) {
                        state.model_name = Some(model.to_string());
                    }
                    if let Some(usage) = msg.get("usage") {
                        if let Some(input) = usage
                            .get("input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.input_tokens = input;
                        }
                        if let Some(output) = usage
                            .get("output_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.output_tokens = output;
                        }
                        if let Some(cache_read) = usage
                            .get("cache_read_input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.cache_read_input_tokens = cache_read;
                        }
                        if let Some(cache_creation) = usage
                            .get("cache_creation_input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.cache_creation_input_tokens = cache_creation;
                        }
                    }
                    events.push(StreamEvent::MessageStart {
                        role: msg
                            .get("role")
                            .and_then(|v| v.as_str())
                            .unwrap_or("assistant")
                            .to_string(),
                        message_id: state
                            .message_id
                            .clone()
                            .unwrap_or_else(|| "unknown".to_string()),
                        model: state
                            .model_name
                            .clone()
                            .unwrap_or_else(|| "unknown".to_string()),
                        usage: state.last_usage.clone(),
                    });
                }
            }

            "content_block_start" => {
                let index = usize::try_from(
                    value
                        .get("index")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(0),
                )
                .unwrap_or(0);
                if let Some(cb) = value.get("content_block") {
                    let block_type = cb.get("type").and_then(|v| v.as_str()).unwrap_or("text");
                    let content_block = match block_type {
                        "text" => crate::model::ContentBlock::Text {
                            text: cb
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        "tool_use" => crate::model::ContentBlock::ToolUse {
                            id: cb
                                .get("id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            name: cb
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            input: cb
                                .get("input")
                                .cloned()
                                .unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
                        },
                        "thinking" => crate::model::ContentBlock::Thinking {
                            text: cb
                                .get("thinking")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            usage: cb.get("usage").and_then(serde_json::Value::as_u64),
                        },
                        other => {
                            tracing::debug!(
                                "lossy downgrade: skipping Anthropic content_block_start type \
                                 '{other}'"
                            );
                            continue;
                        }
                    };
                    state
                        .content_block_kinds
                        .insert(index, content_block_kind(&content_block));
                    events.push(StreamEvent::ContentBlockStart {
                        index,
                        content_block,
                    });
                }
            }

            "content_block_delta" => {
                let index = usize::try_from(
                    value
                        .get("index")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(0),
                )
                .unwrap_or(0);
                if let Some(delta) = value.get("delta") {
                    let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let stream_delta = match delta_type {
                        "text_delta" => StreamDelta::Text {
                            text: delta
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        "thinking_delta" => StreamDelta::Thinking {
                            thinking: delta
                                .get("thinking")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        "signature_delta" => StreamDelta::Signature {
                            signature: delta
                                .get("signature")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        "input_json_delta" => StreamDelta::InputJson {
                            partial_json: delta
                                .get("partial_json")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        other => {
                            tracing::debug!(
                                "lossy downgrade: skipping Anthropic content_block_delta type \
                                 '{other}'"
                            );
                            continue;
                        }
                    };
                    events.push(StreamEvent::ContentBlockDelta {
                        index,
                        delta: stream_delta,
                    });
                }
            }

            "content_block_stop" => {
                let index = usize::try_from(
                    value
                        .get("index")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(0),
                )
                .unwrap_or(0);
                events.push(StreamEvent::ContentBlockStop { index });
            }

            "message_delta" => {
                if let Some(delta) = value.get("delta") {
                    let stop_reason =
                        delta
                            .get("stop_reason")
                            .and_then(|v| v.as_str())
                            .map(|s| match s {
                                "end_turn" => StopReason::EndTurn,
                                "max_tokens" => StopReason::MaxTokens,
                                "tool_use" => StopReason::ToolUse,
                                "stop_sequence" => StopReason::StopSequence,
                                "content_filter" => StopReason::ContentFilter,
                                other => {
                                    tracing::debug!(
                                        "lossy downgrade: unknown stop_reason '{other}'"
                                    );
                                    StopReason::EndTurn
                                }
                            });
                    let stop_sequence = delta
                        .get("stop_sequence")
                        .and_then(|v| v.as_str())
                        .map(std::string::ToString::to_string);
                    if let Some(usage) = value.get("usage") {
                        if let Some(output) = usage
                            .get("output_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.output_tokens = output;
                        }
                        if let Some(cache_read) = usage
                            .get("cache_read_input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.cache_read_input_tokens = cache_read;
                        }
                        if let Some(cache_creation) = usage
                            .get("cache_creation_input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.cache_creation_input_tokens = cache_creation;
                        }
                    }
                    events.push(StreamEvent::MessageDelta {
                        stop_reason,
                        stop_sequence,
                        usage: state.last_usage.clone(),
                    });
                }
            }

            "message_stop" => {
                events.push(StreamEvent::MessageStop);
                if !state.finished {
                    state.finished = true;
                }
            }

            "error" => {
                if let Some(err) = value.get("error") {
                    let error_type = err
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("api_error")
                        .to_string();
                    let message = err
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error")
                        .to_string();
                    events.push(StreamEvent::Error {
                        error_type,
                        message,
                    });
                    if !state.finished {
                        state.finished = true;
                    }
                }
            }

            other => {
                tracing::debug!(
                    "lossy downgrade: skipping unknown Anthropic SSE event type '{other}'"
                );
            }
        }
    }

    Ok(events)
}

fn content_block_kind(block: &crate::model::ContentBlock) -> crate::model::StreamContentBlockKind {
    match block {
        crate::model::ContentBlock::Text { .. } => crate::model::StreamContentBlockKind::Text,
        crate::model::ContentBlock::Thinking { .. } => {
            crate::model::StreamContentBlockKind::Thinking
        }
        crate::model::ContentBlock::ToolUse { .. } => crate::model::StreamContentBlockKind::ToolUse,
        _ => crate::model::StreamContentBlockKind::Text,
    }
}

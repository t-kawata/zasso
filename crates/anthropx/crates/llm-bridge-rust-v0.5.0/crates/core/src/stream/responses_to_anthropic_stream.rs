//! Responses API SSE → Anthropic SSE streaming transform.
//!
//! Maps Responses API streaming events to the Anthropic Messages SSE event sequence.
//! The main event mappings are:
//!
//! | Responses event | Anthropic event |
//! |---|---|
//! | `response.created` / `response.in_progress` | `message_start` |
//! | `response.output_item.added` (message) | `content_block_start` (text) |
//! | `response.output_item.added` (function_call) | `content_block_start` (tool_use) |
//! | `response.output_text.delta` | `content_block_delta` (text_delta) |
//! | `response.reasoning_text.delta` | `content_block_delta` (thinking_delta) |
//! | `response.function_call_arguments.delta` | `content_block_delta` (input_json_delta) |
//! | `response.output_text.done` | `content_block_stop` |
//! | `response.reasoning_text.done` | `content_block_stop` |
//! | `response.function_call_arguments.done` | `content_block_stop` |
//! | `response.completed` / `response.incomplete` | `message_delta` + `message_stop` |
//! | `error` | `error` |

#![allow(clippy::too_many_lines)]

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::json;

use super::SseFrame;
use crate::model::{StreamState, TransformError};

// ---------------------------------------------------------------------------
// Responses SSE event types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ResponsesEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    response: Option<serde_json::Value>,
    #[serde(default)]
    output_index: Option<usize>,
    #[serde(default)]
    item: Option<serde_json::Value>,
    #[serde(default)]
    content_index: Option<usize>,
    #[serde(default)]
    part: Option<serde_json::Value>,
    #[serde(default)]
    item_id: Option<String>,
    #[serde(default)]
    delta: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
    #[serde(default)]
    call_id: Option<String>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    incomplete_details: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Per-block state tracking
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct BlockState {
    kind: ResponsesBlockKind,
    index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum ResponsesBlockKind {
    Text,
    Reasoning,
    ToolUse,
}

// ---------------------------------------------------------------------------
// Transform entry point
// ---------------------------------------------------------------------------

pub(crate) fn transform_responses_stream_to_anthropic(
    frames: &[SseFrame],
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    if state.finished {
        return Ok(Vec::new());
    }

    let mut out = Vec::with_capacity(1024);
    let mut block_counter: usize = 0;
    // Track block_index per (output_index, content_index, kind) combo
    // Using kind as a string key to separate text/reasoning/tool_use blocks.
    let mut block_map: BTreeMap<(usize, usize, &'static str), usize> = BTreeMap::new();
    // Track whether a reasoning block has been started per output_index.
    let mut reasoning_block_index: BTreeMap<usize, usize> = BTreeMap::new();

    for frame in frames {
        let event: ResponsesEvent = serde_json::from_slice(frame.data.as_bytes()).map_err(|e| {
            TransformError::InvalidFormat(format!("Responses SSE event parse: {e}"))
        })?;

        match event.event_type.as_str() {
            "response.created" | "response.in_progress" => {
                if let Some(ref response) = event.response {
                    if let Some(id) = response.get("id").and_then(|v| v.as_str()) {
                        state.message_id = Some(id.to_string());
                    }
                    if let Some(model) = response.get("model").and_then(|v| v.as_str()) {
                        state.model_name = Some(model.to_string());
                    }
                    if let Some(usage) = response.get("usage") {
                        if let Some(input_tokens) = usage
                            .get("input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.input_tokens = input_tokens;
                        }
                        if let Some(output_tokens) = usage
                            .get("output_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.output_tokens = output_tokens;
                        }
                        if let Some(cached) = usage
                            .get("prompt_tokens_details")
                            .and_then(|d| d.get("cached_tokens"))
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.cached_tokens = cached;
                        }
                        if let Some(reasoning) = usage
                            .get("completion_tokens_details")
                            .and_then(|d| d.get("reasoning_tokens"))
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.reasoning_tokens = reasoning;
                        }
                    }
                }
                if !state.started {
                    state.started = true;
                    append_anthropic_sse(
                        &mut out,
                        Some("message_start"),
                        &json!({
                            "type": "message_start",
                            "message": {
                                "id": state.message_id.as_deref().unwrap_or("resp_dummy"),
                                "type": "message",
                                "role": "assistant",
                                "model": state.model_name.as_deref().unwrap_or("unknown"),
                                "content": [],
                                "stop_reason": null,
                                "stop_sequence": null,
                                "usage": {
                                    "input_tokens": state.last_usage.input_tokens,
                                    "output_tokens": state.last_usage.output_tokens,
                                },
                            },
                        }),
                    )?;
                }
            }

            "response.output_item.added" => {
                let output_index = event.output_index.unwrap_or(0);
                if let Some(ref item) = event.item {
                    let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let block_kind = match item_type {
                        "message" => ResponsesBlockKind::Text,
                        "function_call" => ResponsesBlockKind::ToolUse,
                        other => {
                            tracing::debug!(
                                "lossy downgrade: skipping Responses SSE output item type \
                                 '{other}'"
                            );
                            continue;
                        }
                    };

                    let content_index = event.content_index.unwrap_or(0);
                    let kind_tag = match block_kind {
                        ResponsesBlockKind::Text => "text",
                        ResponsesBlockKind::ToolUse => "tool_use",
                        ResponsesBlockKind::Reasoning => unreachable!(),
                    };
                    let key = (output_index, content_index, kind_tag);
                    let block_index = block_counter;
                    block_map.insert(key, block_index);

                    state
                        .content_block_kinds
                        .insert(block_index, crate::model::StreamContentBlockKind::Text);

                    match block_kind {
                        ResponsesBlockKind::Text => {
                            append_anthropic_sse(
                                &mut out,
                                Some("content_block_start"),
                                &json!({
                                    "type": "content_block_start",
                                    "index": block_index,
                                    "content_block": {
                                        "type": "text",
                                        "text": "",
                                    },
                                }),
                            )?;
                        }
                        ResponsesBlockKind::ToolUse => {
                            let call_id =
                                item.get("call_id").and_then(|v| v.as_str()).unwrap_or("");
                            let tool_name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            append_anthropic_sse(
                                &mut out,
                                Some("content_block_start"),
                                &json!({
                                    "type": "content_block_start",
                                    "index": block_index,
                                    "content_block": {
                                        "type": "tool_use",
                                        "id": call_id,
                                        "name": tool_name,
                                        "input": {},
                                    },
                                }),
                            )?;
                        }
                        ResponsesBlockKind::Reasoning => unreachable!(),
                    }

                    block_counter += 1;
                }
            }

            "response.output_text.delta" => {
                let output_index = event.output_index.unwrap_or(0);
                let content_index = event.content_index.unwrap_or(0);
                let key = (output_index, content_index, "text");
                if let Some(&block_index) = block_map.get(&key) {
                    let delta = event.delta.as_deref().unwrap_or("");
                    append_anthropic_sse(
                        &mut out,
                        Some("content_block_delta"),
                        &json!({
                            "type": "content_block_delta",
                            "index": block_index,
                            "delta": {
                                "type": "text_delta",
                                "text": delta,
                            },
                        }),
                    )?;
                }
            }

            "response.reasoning_text.delta" => {
                let output_index = event.output_index.unwrap_or(0);
                let content_index = event.content_index.unwrap_or(0);
                let key = (output_index, content_index, "reasoning");

                let block_index = if let Some(&idx) = block_map.get(&key) {
                    idx
                } else {
                    let idx = block_counter;
                    block_map.insert(key, idx);
                    reasoning_block_index.insert(output_index, idx);
                    state
                        .content_block_kinds
                        .insert(idx, crate::model::StreamContentBlockKind::Thinking);
                    append_anthropic_sse(
                        &mut out,
                        Some("content_block_start"),
                        &json!({
                            "type": "content_block_start",
                            "index": idx,
                            "content_block": {
                                "type": "thinking",
                                "thinking": "",
                            },
                        }),
                    )?;
                    block_counter += 1;
                    idx
                };

                let delta = event.delta.as_deref().unwrap_or("");
                append_anthropic_sse(
                    &mut out,
                    Some("content_block_delta"),
                    &json!({
                        "type": "content_block_delta",
                        "index": block_index,
                        "delta": {
                            "type": "thinking_delta",
                            "thinking": delta,
                        },
                    }),
                )?;
            }

            "response.function_call_arguments.delta" => {
                let output_index = event.output_index.unwrap_or(0);
                let content_index = event.content_index.unwrap_or(0);
                let key = (output_index, content_index, "tool_use");
                if let Some(&block_index) = block_map.get(&key) {
                    let delta = event.delta.as_deref().unwrap_or("");
                    append_anthropic_sse(
                        &mut out,
                        Some("content_block_delta"),
                        &json!({
                            "type": "content_block_delta",
                            "index": block_index,
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": delta,
                            },
                        }),
                    )?;
                }
            }

            "response.output_text.done" => {
                let output_index = event.output_index.unwrap_or(0);
                let content_index = event.content_index.unwrap_or(0);
                let key = (output_index, content_index, "text");
                if let Some(&block_index) = block_map.get(&key) {
                    append_anthropic_sse(
                        &mut out,
                        Some("content_block_stop"),
                        &json!({
                            "type": "content_block_stop",
                            "index": block_index,
                        }),
                    )?;
                }
            }

            "response.reasoning_text.done" => {
                let output_index = event.output_index.unwrap_or(0);
                if let Some(&block_index) = reasoning_block_index.get(&output_index) {
                    append_anthropic_sse(
                        &mut out,
                        Some("content_block_stop"),
                        &json!({
                            "type": "content_block_stop",
                            "index": block_index,
                        }),
                    )?;
                }
            }

            "response.function_call_arguments.done" => {
                let output_index = event.output_index.unwrap_or(0);
                let content_index = event.content_index.unwrap_or(0);
                let key = (output_index, content_index, "tool_use");
                if let Some(&block_index) = block_map.get(&key) {
                    append_anthropic_sse(
                        &mut out,
                        Some("content_block_stop"),
                        &json!({
                            "type": "content_block_stop",
                            "index": block_index,
                        }),
                    )?;
                }
            }

            "response.output_item.done" => {
                // No direct Anthropic equivalent — content_block_stop already emitted.
            }

            "response.content_part.added" | "response.content_part.done" => {
                // Internal Responses lifecycle — no Anthropic mapping needed.
            }

            "response.completed" | "response.incomplete" => {
                let stop_reason = if event.event_type == "response.incomplete" {
                    "max_tokens"
                } else {
                    "end_turn"
                };

                if let Some(ref response) = event.response {
                    if let Some(usage) = response.get("usage") {
                        if let Some(input_tokens) = usage
                            .get("input_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.input_tokens = input_tokens;
                        }
                        if let Some(output_tokens) = usage
                            .get("output_tokens")
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.output_tokens = output_tokens;
                        }
                        if let Some(cached) = usage
                            .get("prompt_tokens_details")
                            .and_then(|d| d.get("cached_tokens"))
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.cached_tokens = cached;
                        }
                        if let Some(reasoning) = usage
                            .get("completion_tokens_details")
                            .and_then(|d| d.get("reasoning_tokens"))
                            .and_then(serde_json::Value::as_u64)
                        {
                            state.last_usage.reasoning_tokens = reasoning;
                        }
                    }
                }

                append_anthropic_sse(
                    &mut out,
                    Some("message_delta"),
                    &json!({
                        "type": "message_delta",
                        "delta": {
                            "stop_reason": stop_reason,
                            "stop_sequence": null,
                        },
                        "usage": {
                            "output_tokens": state.last_usage.output_tokens,
                        },
                    }),
                )?;

                append_anthropic_sse(
                    &mut out,
                    Some("message_stop"),
                    &json!({
                        "type": "message_stop",
                    }),
                )?;

                if !state.finished {
                    state.finished = true;
                }
            }

            "error" => {
                let code = event.code.as_deref().unwrap_or("api_error");
                let message = event
                    .message
                    .as_deref()
                    .unwrap_or("Responses API stream error");
                append_anthropic_sse(
                    &mut out,
                    Some("error"),
                    &json!({
                        "type": "error",
                        "error": {
                            "type": code,
                            "message": message,
                        },
                    }),
                )?;
                if !state.finished {
                    state.finished = true;
                }
            }

            "ping" => {
                // Responses ping — no Anthropic equivalent needed.
            }

            other => {
                tracing::debug!(
                    "lossy downgrade: skipping unsupported Responses SSE event type '{other}'"
                );
            }
        }
    }

    Ok(out)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn append_anthropic_sse(
    out: &mut Vec<u8>,
    event: Option<&str>,
    data: &serde_json::Value,
) -> Result<(), TransformError> {
    let serialized = serde_json::to_vec(data)
        .map_err(|e| TransformError::InvalidFormat(format!("Anthropic SSE serialization: {e}")))?;

    if let Some(ev) = event {
        out.extend_from_slice(b"event: ");
        out.extend_from_slice(ev.as_bytes());
        out.push(b'\n');
    }
    out.extend_from_slice(b"data: ");
    out.extend_from_slice(&serialized);
    out.extend_from_slice(b"\n\n");

    Ok(())
}

//! Helper functions for the HTTP proxy example.
//!
//! This module collects the pure utility functions used by the proxy handlers:
//! token estimation, header manipulation, protocol response transformation,
//! SSE frame parsing, request introspection, and error response construction.

use std::collections::HashMap;

use axum::{Json, http::StatusCode};
use bytes::Bytes;
use llm_bridge_core::{
    model::{StreamDelta, StreamEvent, TransformRequest},
    stream::events_to_sse,
    transform::{
        anthropic_response_to_openai_response, anthropic_response_to_responses_response,
        openai_response_to_anthropic_message,
    },
};
use serde_json::json;
use tracing::info;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of bytes to log from an upstream error response body.
/// Prevents log flooding from oversized error payloads.
pub(crate) const MAX_LOGGED_UPSTREAM_ERROR_BODY_BYTES: usize = 8 * 1024;

/// Maximum number of pending SSE bytes before the proxy stops buffering.
/// Protects against unbounded memory growth from slow or misbehaving upstreams.
pub(crate) const MAX_SSE_PENDING_BYTES: usize = 8 * 1024 * 1024;

/// Replacement value inserted when redacting sensitive HTTP headers in logs.
pub(crate) const REDACTED_HEADER_VALUE: &str = "<redacted>";

/// Fixed signature used in tests to validate synthetic thinking-block handling
/// without requiring a real upstream cryptographic signature.
#[cfg(test)]
pub(crate) const SYNTHETIC_THINKING_SIGNATURE: &str =
    "bGxtLWJyaWRnZS1zeW50aGV0aWMtdGhpbmtpbmctc2lnbmF0dXJl";

// ---------------------------------------------------------------------------
// Token estimation (rough heuristic)
// ---------------------------------------------------------------------------

/// Estimate token count from a JSON body.
///
/// Uses a rough heuristic of ~4 characters per token for English text.
/// Returns 0 when the body contains no extractable text.
pub(crate) fn estimate_tokens(body: &serde_json::Value) -> u64 {
    let text = extract_text_from_json(body);
    if text.is_empty() {
        0
    } else {
        (text.len() as u64).div_ceil(4)
    }
}

/// Recursively extract all string values from a JSON value, joining them with spaces.
fn extract_text_from_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .map(extract_text_from_json)
            .collect::<Vec<_>>()
            .join(" "),
        serde_json::Value::Object(map) => map
            .values()
            .map(extract_text_from_json)
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Header processing
// ---------------------------------------------------------------------------

/// Returns `true` if the header name carries authentication or API-key material
/// that must be redacted before logging.
pub(crate) fn is_sensitive_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization" | "proxy-authorization" | "x-api-key"
    )
}

/// Return a copy of `headers` with sensitive values replaced by
/// [`REDACTED_HEADER_VALUE`].
pub(crate) fn redact_headers(headers: &HashMap<String, String>) -> HashMap<String, String> {
    headers
        .iter()
        .map(|(name, value)| {
            let redacted_value = if is_sensitive_header(name) {
                REDACTED_HEADER_VALUE.to_string()
            } else {
                value.clone()
            };
            (name.clone(), redacted_value)
        })
        .collect()
}

/// Decide whether a client-supplied header should be forwarded verbatim to the
/// upstream.
///
/// Hop-by-hop, framing, and authentication headers are dropped — the proxy
/// rebuilds them for the new connection.
fn should_forward_client_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "host"
            | "content-length"
            | "connection"
            | "proxy-connection"
            | "keep-alive"
            | "transfer-encoding"
            | "te"
            | "trailer"
            | "upgrade"
            | "accept-encoding"
            | "x-api-key"
            | "authorization"
            | "proxy-authorization"
    )
}

/// Decide whether a transform-layer header should be forwarded to the upstream.
///
/// Keeps semantic headers (e.g. `content-type`) but still drops framing and
/// connection-specific headers so `reqwest` can derive them from the final body
/// and upstream URL.
fn should_forward_transformed_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "content-length"
            | "connection"
            | "proxy-connection"
            | "keep-alive"
            | "transfer-encoding"
            | "te"
            | "trailer"
            | "upgrade"
            | "authorization"
            | "proxy-authorization"
    )
}

/// Merge client headers, transformed protocol headers, and upstream
/// authentication into the final header map for an `OpenAI`-compatible upstream.
///
/// # Header forwarding policy
///
/// - Forward end-to-end metadata that is still valid after body transform (e.g. `content-type`,
///   `accept`, `user-agent`).
/// - Rebuild framing / target / auth headers for the new upstream request: `host`,
///   `content-length`, `transfer-encoding`, `authorization`.
/// - Let `reqwest` negotiate and decode compressed upstream responses instead of forwarding the
///   client's `accept-encoding` preferences verbatim.
/// - Drop hop-by-hop connection headers because they only apply to the client → proxy connection,
///   not the proxy → upstream connection.
pub(crate) fn build_upstream_headers(
    client_headers: &HashMap<String, String>,
    transformed_headers: &HashMap<String, String>,
    upstream_api_key: &str,
    request_is_streaming: bool,
) -> HashMap<String, String> {
    let mut final_headers: HashMap<String, String> = HashMap::new();

    // 1. Preserve safe end-to-end client metadata.
    for (name, value) in client_headers {
        if should_forward_client_header(name) {
            final_headers.insert(name.clone(), value.clone());
        }
    }

    // 2. Overlay transformed protocol headers (e.g. content-type).
    for (name, value) in transformed_headers {
        if should_forward_transformed_header(name) {
            final_headers.insert(name.clone(), value.clone());
        }
    }

    // 3. Inject upstream auth explicitly. Never forward client-facing auth.
    final_headers.insert(
        "Authorization".to_string(),
        format!("Bearer {upstream_api_key}"),
    );

    if request_is_streaming {
        final_headers.insert("accept".to_string(), "text/event-stream".to_string());
    }

    final_headers
}

/// Merge client headers, transformed protocol headers, and upstream
/// authentication into the final header map for an Anthropic-compatible
/// upstream.
///
/// Uses `x-api-key` instead of `Authorization: Bearer` and strips any
/// `authorization` header that leaked through the transform layer.
pub(crate) fn build_anthropic_upstream_headers(
    client_headers: &HashMap<String, String>,
    transformed_headers: &HashMap<String, String>,
    upstream_api_key: &str,
    request_is_streaming: bool,
) -> HashMap<String, String> {
    let mut final_headers: HashMap<String, String> = HashMap::new();

    for (name, value) in client_headers {
        if should_forward_client_header(name) {
            final_headers.insert(name.clone(), value.clone());
        }
    }

    for (name, value) in transformed_headers {
        if should_forward_transformed_header(name) {
            final_headers.insert(name.clone(), value.clone());
        }
    }

    final_headers.remove("authorization");
    final_headers.remove("Authorization");
    final_headers.insert("x-api-key".to_string(), upstream_api_key.to_string());

    if request_is_streaming {
        final_headers.insert("accept".to_string(), "text/event-stream".to_string());
    }

    final_headers
}

// ---------------------------------------------------------------------------
// Response transformation
// ---------------------------------------------------------------------------

/// Transform a non-streaming Anthropic `/v1/messages` response body into an
/// `OpenAI` `/v1/chat/completions` response body.
pub(crate) fn transform_anthropic_response_to_openai_completion(
    body: &Bytes,
) -> Result<Bytes, String> {
    let req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/messages".to_string(),
        body: body.clone(),
    };

    anthropic_response_to_openai_response(&req)
        .map(|response| response.body)
        .map_err(|e| format!("failed to transform upstream Anthropic response body: {e}"))
}

/// Transform a non-streaming Anthropic `/v1/messages` response body into an
/// `OpenAI` Responses API response body.
pub(crate) fn transform_anthropic_response_to_openai_responses(
    body: &Bytes,
) -> Result<Bytes, String> {
    let req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/messages".to_string(),
        body: body.clone(),
    };

    anthropic_response_to_responses_response(&req)
        .map(|response| response.body)
        .map_err(|e| format!("failed to transform upstream Anthropic response body: {e}"))
}

/// Transform a non-streaming `OpenAI` `/v1/chat/completions` response body into
/// an Anthropic `/v1/messages` response body.
pub(crate) fn transform_openai_response_to_anthropic_message(
    body: &Bytes,
) -> Result<Bytes, String> {
    let req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/chat/completions".to_string(),
        body: body.clone(),
    };

    openai_response_to_anthropic_message(&req)
        .map(|response| response.body)
        .map_err(|e| format!("failed to transform upstream `OpenAI` response body: {e}"))
}

/// Convert a non-streaming Anthropic message response into a synthetic SSE
/// stream that replays the full content as `message_start`, content-block
/// events, `message_delta`, and `message_stop`.
#[allow(clippy::too_many_lines)]
pub(crate) fn transform_anthropic_message_to_sse(body: &Bytes) -> Result<Bytes, String> {
    let response: serde_json::Value = serde_json::from_slice(body)
        .map_err(|e| format!("failed to parse Anthropic message response body: {e}"))?;

    let role = response
        .get("role")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("assistant")
        .to_string();

    let input_tokens = response
        .get("usage")
        .and_then(|usage| usage.get("input_tokens"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    let output_tokens = response
        .get("usage")
        .and_then(|usage| usage.get("output_tokens"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    let message_id = response
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("msg_llm_bridge")
        .to_string();
    let model = response
        .get("model")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("llm-bridge")
        .to_string();

    let stop_reason = response
        .get("stop_reason")
        .and_then(serde_json::Value::as_str)
        .and_then(|s| match s {
            "end_turn" => Some(llm_bridge_core::model::StopReason::EndTurn),
            "max_tokens" => Some(llm_bridge_core::model::StopReason::MaxTokens),
            "tool_use" => Some(llm_bridge_core::model::StopReason::ToolUse),
            "content_filter" => Some(llm_bridge_core::model::StopReason::ContentFilter),
            _ => None,
        });

    let mut events = Vec::new();
    events.push(StreamEvent::MessageStart {
        role,
        message_id,
        model,
        usage: llm_bridge_core::model::Usage {
            input_tokens,
            output_tokens: 0,
            ..Default::default()
        },
    });

    if let Some(content_blocks) = response
        .get("content")
        .and_then(serde_json::Value::as_array)
    {
        for (index, block) in content_blocks.iter().enumerate() {
            let block_type = block
                .get("type")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");

            match block_type {
                "thinking" => {
                    let thinking = block
                        .get("thinking")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    let signature = block
                        .get("signature")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    events.push(StreamEvent::ContentBlockStart {
                        index,
                        content_block: llm_bridge_core::model::ContentBlock::Thinking {
                            text: String::new(),
                            usage: None,
                        },
                    });
                    if !thinking.is_empty() {
                        events.push(StreamEvent::ContentBlockDelta {
                            index,
                            delta: StreamDelta::Thinking {
                                thinking: thinking.to_string(),
                            },
                        });
                    }
                    if !signature.is_empty() {
                        events.push(StreamEvent::ContentBlockDelta {
                            index,
                            delta: StreamDelta::Signature {
                                signature: signature.to_string(),
                            },
                        });
                    }
                    events.push(StreamEvent::ContentBlockStop { index });
                }
                "text" => {
                    let text = block
                        .get("text")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    events.push(StreamEvent::ContentBlockStart {
                        index,
                        content_block: llm_bridge_core::model::ContentBlock::Text {
                            text: String::new(),
                        },
                    });
                    if !text.is_empty() {
                        events.push(StreamEvent::ContentBlockDelta {
                            index,
                            delta: StreamDelta::Text {
                                text: text.to_string(),
                            },
                        });
                    }
                    events.push(StreamEvent::ContentBlockStop { index });
                }
                "tool_use" => {
                    let id = block
                        .get("id")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let input = block
                        .get("input")
                        .cloned()
                        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
                    events.push(StreamEvent::ContentBlockStart {
                        index,
                        content_block: llm_bridge_core::model::ContentBlock::ToolUse {
                            id,
                            name,
                            input,
                        },
                    });
                    events.push(StreamEvent::ContentBlockStop { index });
                }
                _ => {}
            }
        }
    }

    events.push(StreamEvent::MessageDelta {
        stop_reason,
        stop_sequence: None,
        usage: llm_bridge_core::model::Usage {
            input_tokens,
            output_tokens,
            ..Default::default()
        },
    });
    events.push(StreamEvent::MessageStop);

    Ok(Bytes::from(events_to_sse(&events)))
}

/// Convert a non-streaming `OpenAI` chat-completion response into a synthetic SSE
/// stream of `chat.completion.chunk` events, including reasoning, text, and
/// tool-call deltas, followed by `data: [DONE]`.
#[allow(clippy::too_many_lines)]
pub(crate) fn transform_openai_completion_to_sse(body: &Bytes) -> Result<Bytes, String> {
    let response: serde_json::Value = serde_json::from_slice(body)
        .map_err(|e| format!("failed to parse `OpenAI` completion response body: {e}"))?;

    let id = response
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("chatcmpl_llm_bridge");
    let model = response
        .get("model")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("llm-bridge");
    let choice = response
        .get("choices")
        .and_then(serde_json::Value::as_array)
        .and_then(|choices| choices.first())
        .ok_or_else(|| "missing choices[0] in `OpenAI` completion response".to_string())?;
    let message = choice
        .get("message")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "missing choices[0].message in `OpenAI` completion response".to_string())?;
    let finish_reason = choice
        .get("finish_reason")
        .and_then(serde_json::Value::as_str);
    let usage = response.get("usage").cloned();

    let mut chunks = Vec::new();
    chunks.push(json!({
        "id": id,
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {
                "role": message
                    .get("role")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("assistant"),
            }
        }],
    }));

    if let Some(reasoning_content) = message
        .get("reasoning_content")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
    {
        chunks.push(json!({
            "id": id,
            "object": "chat.completion.chunk",
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {
                    "reasoning_content": reasoning_content,
                }
            }],
        }));
    }

    if let Some(content) = message
        .get("content")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
    {
        chunks.push(json!({
            "id": id,
            "object": "chat.completion.chunk",
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {
                    "content": content,
                }
            }],
        }));
    }

    if let Some(tool_calls) = message
        .get("tool_calls")
        .and_then(serde_json::Value::as_array)
    {
        for tool_call in tool_calls {
            chunks.push(json!({
                "id": id,
                "object": "chat.completion.chunk",
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {
                        "tool_calls": [tool_call],
                    }
                }],
            }));
        }
    }

    let mut final_chunk = json!({
        "id": id,
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {},
            "finish_reason": finish_reason,
        }],
    });
    if let Some(usage) = usage
        && let Some(object) = final_chunk.as_object_mut()
    {
        object.insert("usage".to_string(), usage);
    }
    chunks.push(final_chunk);

    let mut out = Vec::with_capacity(1024);
    for chunk in chunks {
        let serialized = serde_json::to_vec(&chunk)
            .map_err(|e| format!("failed to serialize `OpenAI` SSE chunk: {e}"))?;
        out.extend_from_slice(b"data: ");
        out.extend_from_slice(&serialized);
        out.extend_from_slice(b"\n\n");
    }
    out.extend_from_slice(b"data: [DONE]\n\n");

    Ok(Bytes::from(out))
}

/// Convert a non-streaming `OpenAI` Responses API response into a synthetic SSE
/// stream of `response.*` events, including message items, function-call items,
/// and a terminal `response.completed` or `response.incomplete` event.
#[allow(clippy::too_many_lines)]
pub(crate) fn transform_openai_responses_to_sse(body: &Bytes) -> Result<Bytes, String> {
    let response: serde_json::Value = serde_json::from_slice(body)
        .map_err(|e| format!("failed to parse `OpenAI` Responses body: {e}"))?;
    let response_id = response
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("resp_llm_bridge");
    let created_at = response
        .get("created_at")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    let model = response
        .get("model")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("llm-bridge");
    let status = response
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("completed");
    let output = response
        .get("output")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "missing output in `OpenAI` Responses body".to_string())?;

    let mut sequence_number = 0_u64;
    let mut events = Vec::new();
    events.push(json!({
        "type": "response.created",
        "sequence_number": sequence_number,
        "response": {
            "id": response_id,
            "object": "response",
            "created_at": created_at,
            "status": "in_progress",
            "model": model,
            "output": [],
            "output_text": "",
            "usage": response.get("usage").cloned().unwrap_or_else(|| json!({})),
        },
    }));
    sequence_number = sequence_number.saturating_add(1);
    events.push(json!({
        "type": "response.in_progress",
        "sequence_number": sequence_number,
        "response": {
            "id": response_id,
            "object": "response",
            "created_at": created_at,
            "status": "in_progress",
            "model": model,
            "output": [],
            "output_text": "",
            "usage": response.get("usage").cloned().unwrap_or_else(|| json!({})),
        },
    }));

    for (output_index, item) in output.iter().enumerate() {
        sequence_number = sequence_number.saturating_add(1);
        let item_type = item
            .get("type")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        match item_type {
            "message" => {
                let item_id = item
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("msg_llm_bridge");
                let content = item
                    .get("content")
                    .and_then(serde_json::Value::as_array)
                    .and_then(|parts| parts.first())
                    .cloned()
                    .ok_or_else(|| "missing content[0] in Responses message item".to_string())?;
                let part_type = content
                    .get("type")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                let text = content
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");

                events.push(json!({
                    "type": "response.output_item.added",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item": {
                        "id": item_id,
                        "type": "message",
                        "role": "assistant",
                        "status": "in_progress",
                        "content": [],
                    },
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": "response.content_part.added",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item_id": item_id,
                    "content_index": 0,
                    "part": if part_type == "output_text" {
                        json!({ "type": "output_text", "text": "", "annotations": [] })
                    } else {
                        json!({ "type": "reasoning_text", "text": "" })
                    },
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": if part_type == "output_text" {
                        "response.output_text.delta"
                    } else {
                        "response.reasoning_text.delta"
                    },
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item_id": item_id,
                    "content_index": 0,
                    "delta": text,
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": if part_type == "output_text" {
                        "response.output_text.done"
                    } else {
                        "response.reasoning_text.done"
                    },
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item_id": item_id,
                    "content_index": 0,
                    "text": text,
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": "response.content_part.done",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item_id": item_id,
                    "content_index": 0,
                    "part": content,
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": "response.output_item.done",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item": item,
                }));
            }
            "function_call" => {
                let item_id = item
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("fc_llm_bridge");
                let name = item
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");
                let arguments = item
                    .get("arguments")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");

                events.push(json!({
                    "type": "response.output_item.added",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item": {
                        "id": item_id,
                        "type": "function_call",
                        "call_id": item.get("call_id").cloned().unwrap_or(serde_json::Value::Null),
                        "name": name,
                        "arguments": "",
                        "status": "in_progress",
                    },
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": "response.function_call_arguments.delta",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item_id": item_id,
                    "delta": arguments,
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": "response.function_call_arguments.done",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item_id": item_id,
                    "name": name,
                    "arguments": arguments,
                }));
                sequence_number = sequence_number.saturating_add(1);
                events.push(json!({
                    "type": "response.output_item.done",
                    "sequence_number": sequence_number,
                    "output_index": output_index,
                    "item": item,
                }));
            }
            _ => {}
        }
    }

    sequence_number = sequence_number.saturating_add(1);
    events.push(json!({
        "type": if status == "incomplete" {
            "response.incomplete"
        } else {
            "response.completed"
        },
        "sequence_number": sequence_number,
        "response": response,
    }));

    let mut out = Vec::with_capacity(1024);
    for event in events {
        let serialized = serde_json::to_vec(&event)
            .map_err(|e| format!("failed to serialize Responses SSE event: {e}"))?;
        out.extend_from_slice(b"data: ");
        out.extend_from_slice(&serialized);
        out.extend_from_slice(b"\n\n");
    }
    out.extend_from_slice(b"data: [DONE]\n\n");

    Ok(Bytes::from(out))
}

// ---------------------------------------------------------------------------
// SSE processing
// ---------------------------------------------------------------------------

/// Returns `true` if the content-type indicates an SSE (`text/event-stream`)
/// response.
pub(crate) fn is_event_stream_content_type(content_type: Option<&str>) -> bool {
    content_type.is_some_and(|value| value.to_ascii_lowercase().contains("text/event-stream"))
}

/// Scan `buffer` for the last complete SSE frame boundary (`\n\n` or
/// `\r\n\r\n`).
///
/// Returns the byte offset immediately after the boundary, or `None` if no
/// complete frame has been received yet.
pub(crate) fn find_last_sse_frame_boundary(buffer: &[u8]) -> Option<usize> {
    let mut last_boundary = None;

    for i in 0..buffer.len().saturating_sub(1) {
        if buffer[i] == b'\n' && buffer[i + 1] == b'\n' {
            last_boundary = Some(i + 2);
        }
    }

    for i in 0..buffer.len().saturating_sub(3) {
        if &buffer[i..i + 4] == b"\r\n\r\n" {
            last_boundary = Some(i + 4);
        }
    }

    last_boundary
}

/// Drain all complete SSE frames from `buffer` and return them as a new byte
/// vector.
///
/// Leaves any incomplete trailing data in `buffer` for the next call. Returns
/// `None` when no complete frame is available yet.
pub(crate) fn take_complete_sse_frames(buffer: &mut Vec<u8>) -> Option<Vec<u8>> {
    let boundary = find_last_sse_frame_boundary(buffer)?;
    Some(buffer.drain(..boundary).collect())
}

/// Extract all `event:` type values from a raw SSE byte slice.
pub(crate) fn extract_sse_event_types(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| line.trim().strip_prefix("event:"))
        .map(|event_type| event_type.trim().to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// Request validation / introspection
// ---------------------------------------------------------------------------

/// Returns `true` when the JSON request body contains `"stream": true`.
pub(crate) fn is_streaming_request(body: &Bytes) -> bool {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("stream").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

/// Extract the `model` field from a JSON request body, if present.
pub(crate) fn requested_model(body: &Bytes) -> Option<String> {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("model")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
}

/// Returns `true` if the Anthropic request body contains a `thinking`
/// configuration block.
#[cfg(test)]
pub(crate) fn anthropic_request_has_thinking(body: &Bytes) -> bool {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("thinking").cloned())
        .is_some()
}

/// Returns `true` if `upstream_url` points at a `DashScope` host
/// (`*.dashscope.aliyuncs.com`).
pub(crate) fn is_dashscope_upstream(upstream_url: &str) -> bool {
    reqwest::Url::parse(upstream_url)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| host.ends_with("dashscope.aliyuncs.com"))
        })
        .unwrap_or_else(|| upstream_url.contains("dashscope.aliyuncs.com"))
}

/// Returns `true` when the upstream is a native Anthropic API
/// (e.g., `api.anthropic.com`) that accepts `/v1/messages` directly in
/// Anthropic format.
pub(crate) fn is_anthropic_upstream(upstream_url: &str) -> bool {
    reqwest::Url::parse(upstream_url)
        .ok()
        .and_then(|url| url.host_str().map(|host| host == "api.anthropic.com"))
        .unwrap_or_else(|| upstream_url.contains("api.anthropic.com"))
}

/// Insert `"enable_thinking": false` into an `OpenAI`-format request body when
/// the upstream is `DashScope` and the caller did not already set the field.
///
/// `DashScope` requires this explicit opt-out to suppress extended thinking on
/// models that support it.
pub(crate) fn maybe_disable_dashscope_thinking(upstream_url: &str, openai_body: &Bytes) -> Bytes {
    if !is_dashscope_upstream(upstream_url) {
        return openai_body.clone();
    }

    let Ok(mut value) = serde_json::from_slice::<serde_json::Value>(openai_body) else {
        return openai_body.clone();
    };
    let Some(object) = value.as_object_mut() else {
        return openai_body.clone();
    };
    if object.get("enable_thinking").is_some() {
        return openai_body.clone();
    }

    object.insert(
        "enable_thinking".to_string(),
        serde_json::Value::Bool(false),
    );
    serde_json::to_vec(&value).map_or_else(|_| openai_body.clone(), Bytes::from)
}

/// Returns `true` when raw SSE debug logging is enabled via the
/// `DEBUG_ANTHROPIC_SSE` environment variable.
///
/// Recognised truthy values: `1`, `true`, `TRUE`, `yes`, `YES`.
pub(crate) fn should_log_raw_anthropic_sse() -> bool {
    std::env::var("DEBUG_ANTHROPIC_SSE")
        .is_ok_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
}

/// Log a raw Anthropic SSE chunk when debug logging is enabled.
pub(crate) fn maybe_log_raw_anthropic_sse_chunk(label: &str, bytes: &[u8]) {
    if !should_log_raw_anthropic_sse() {
        return;
    }

    let raw = String::from_utf8_lossy(bytes);
    info!(label, raw_sse = %raw, "← downstream anthropic SSE raw");
}

/// Log a raw upstream SSE chunk when debug logging is enabled, including the
/// proxy request ID and buffer length for correlation.
pub(crate) fn maybe_log_raw_upstream_sse_chunk(
    proxy_request_id: u64,
    label: &str,
    bytes: &[u8],
    pending_len: usize,
) {
    if !should_log_raw_anthropic_sse() {
        return;
    }

    let raw = String::from_utf8_lossy(bytes);
    info!(
        proxy_request_id,
        label,
        chunk_bytes = bytes.len(),
        pending_len,
        raw_upstream_sse = %raw,
        "← upstream raw SSE chunk"
    );
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/// Format an upstream error body for inclusion in a log message.
///
/// Truncates bodies larger than [`MAX_LOGGED_UPSTREAM_ERROR_BODY_BYTES`] and
/// replaces empty bodies with `<empty>`.
pub(crate) fn format_upstream_error_body_for_log(body: &Bytes) -> String {
    let bytes = body.as_ref();
    let preview_bytes = bytes
        .get(..MAX_LOGGED_UPSTREAM_ERROR_BODY_BYTES)
        .unwrap_or(bytes);
    let preview = String::from_utf8_lossy(preview_bytes).into_owned();

    if bytes.len() > preview_bytes.len() {
        format!(
            "{preview}… <truncated {} bytes>",
            bytes.len() - preview_bytes.len()
        )
    } else if preview.is_empty() {
        "<empty>".to_string()
    } else {
        preview
    }
}

/// Map an HTTP status code to the corresponding Anthropic error-type string.
pub(crate) fn map_http_status_to_anthropic_error_type(status: StatusCode) -> &'static str {
    match status.as_u16() {
        400 => "invalid_request_error",
        401 => "authentication_error",
        402 => "billing_error",
        403 => "permission_error",
        404 => "not_found_error",
        413 => "request_too_large",
        429 => "rate_limit_error",
        504 => "timeout_error",
        529 => "overloaded_error",
        _ => "api_error",
    }
}

/// Build a JSON error response in Anthropic format.
pub(crate) fn build_anthropic_error_response(
    status: StatusCode,
    message: impl Into<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let error_type = map_http_status_to_anthropic_error_type(status);
    let body = json!({
        "type": "error",
        "error": {
            "type": error_type,
            "message": message.into(),
        },
    });
    (status, Json(body))
}

/// Build a JSON error response in `OpenAI` format.
pub(crate) fn build_openai_error_response(
    status: StatusCode,
    message: impl Into<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let error_type = map_http_status_to_anthropic_error_type(status);
    let body = json!({
        "error": {
            "message": message.into(),
            "type": error_type,
            "code": serde_json::Value::Null,
        }
    });
    (status, Json(body))
}

/// Re-format an upstream error body (assumed to be `OpenAI`-style JSON) into an
/// Anthropic-style error JSON.
///
/// Falls back to the raw bytes when the body is not valid JSON or serialization
/// fails.
pub(crate) fn transform_upstream_error_body_to_anthropic(
    body: &Bytes,
    status: StatusCode,
) -> Bytes {
    // Try to parse upstream error JSON (`OpenAI`-style) and extract message
    let message = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(body) {
        json.get("error")
            .and_then(|e| e.get("message"))
            .or_else(|| json.get("error"))
            .and_then(serde_json::Value::as_str)
            .map_or_else(|| String::from_utf8_lossy(body).into_owned(), String::from)
    } else {
        String::from_utf8_lossy(body).into_owned()
    };

    let error_type = map_http_status_to_anthropic_error_type(status);
    let anthropic_error = json!({
        "type": "error",
        "error": {
            "type": error_type,
            "message": message,
        },
    });

    serde_json::to_vec(&anthropic_error).map_or_else(|_| body.clone(), Bytes::from)
}

/// Re-format an upstream error body (assumed to be Anthropic-style JSON) into
/// an `OpenAI`-style error JSON.
///
/// Falls back to the raw bytes when the body is not valid JSON or serialization
/// fails.
pub(crate) fn transform_upstream_error_body_to_openai(body: &Bytes, status: StatusCode) -> Bytes {
    let message = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(body) {
        json.get("error")
            .and_then(|e| e.get("message"))
            .or_else(|| json.get("error"))
            .and_then(serde_json::Value::as_str)
            .map_or_else(|| String::from_utf8_lossy(body).into_owned(), String::from)
    } else {
        String::from_utf8_lossy(body).into_owned()
    };

    let error_type = map_http_status_to_anthropic_error_type(status);
    let openai_error = json!({
        "error": {
            "message": message,
            "type": error_type,
            "code": serde_json::Value::Null,
        }
    });

    serde_json::to_vec(&openai_error).map_or_else(|_| body.clone(), Bytes::from)
}

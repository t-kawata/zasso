//! Anthropic-to-OpenAI Responses SSE transformation.

use std::collections::BTreeMap;

use serde_json::json;

use super::{
    SseFrame,
    anthropic_types::{
        AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent,
        AnthropicContentBlockStopEvent, AnthropicErrorEvent, AnthropicMessageDeltaEvent,
        AnthropicMessageStartEvent,
    },
    frame_dispatch::{ParsedAnthropicEvent, parse_anthropic_stream_frames},
    stream_helpers::{
        anthropic_tool_use_id, current_unix_timestamp, default_model_name,
        ensure_responses_created_at, next_responses_sequence_number, responses_function_item_id,
        responses_message_item_id, responses_response_id,
    },
};
use crate::model::{StopReason, StreamContentBlockKind, StreamState, TransformError};

pub(crate) fn transform_anthropic_stream_to_openai_responses(
    frames: &[SseFrame],
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    if state.finished {
        return Ok(Vec::new());
    }

    let mut out = Vec::with_capacity(1024);

    for result in parse_anthropic_stream_frames(frames) {
        match result? {
            ParsedAnthropicEvent::Done => {
                if !state.finished {
                    out.extend_from_slice(b"data: [DONE]\n\n");
                    state.finished = true;
                }
            }
            ParsedAnthropicEvent::Event {
                event_type,
                payload,
            } => {
                handle_anthropic_event(&mut out, state, &event_type, payload)?;
            }
        }
    }

    Ok(out)
}

fn handle_anthropic_event(
    out: &mut Vec<u8>,
    state: &mut StreamState,
    event_type: &str,
    payload: serde_json::Value,
) -> Result<(), TransformError> {
    match event_type {
        "ping" => {}
        "message_start" => {
            let event: AnthropicMessageStartEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!("Anthropic message_start parse: {e}"))
                })?;

            if let Some(id) = event.message.id.filter(|value| !value.is_empty()) {
                state.message_id = Some(id);
            }
            if let Some(model) = event.message.model.filter(|value| !value.is_empty()) {
                state.model_name = Some(model);
            }
            if let Some(usage) = event.message.usage {
                if let Some(input_tokens) = usage.input_tokens {
                    state.last_usage.input_tokens = input_tokens;
                }
                if let Some(output_tokens) = usage.output_tokens {
                    state.last_usage.output_tokens = output_tokens;
                }
            }
            state.started = true;
            let _created_at = ensure_responses_created_at(state);

            append_responses_sse_event(
                out,
                &json!({
                    "type": "response.created",
                    "sequence_number": next_responses_sequence_number(state),
                    "response": build_responses_stream_response(state, "in_progress", None),
                }),
            )?;
            append_responses_sse_event(
                out,
                &json!({
                    "type": "response.in_progress",
                    "sequence_number": next_responses_sequence_number(state),
                    "response": build_responses_stream_response(state, "in_progress", None),
                }),
            )?;
        }
        "content_block_start" => {
            let event: AnthropicContentBlockStartEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "Anthropic content_block_start parse: {e}"
                    ))
                })?;

            match event.content_block.block_type.as_str() {
                "text" => {
                    let item_id = responses_message_item_id(state, event.index);
                    state
                        .content_block_kinds
                        .insert(event.index, StreamContentBlockKind::Text);
                    state
                        .responses
                        .item_ids
                        .insert(event.index, item_id.clone());
                    state
                        .responses
                        .text_fragments
                        .entry(event.index)
                        .or_default();

                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_item.added",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item": {
                                "id": item_id,
                                "type": "message",
                                "role": "assistant",
                                "status": "in_progress",
                                "content": [],
                            },
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.content_part.added",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "part": {
                                "type": "output_text",
                                "text": "",
                                "annotations": [],
                            },
                        }),
                    )?;
                }
                "thinking" => {
                    let item_id = responses_message_item_id(state, event.index);
                    state
                        .content_block_kinds
                        .insert(event.index, StreamContentBlockKind::Thinking);
                    state
                        .responses
                        .item_ids
                        .insert(event.index, item_id.clone());
                    state
                        .responses
                        .reasoning_fragments
                        .entry(event.index)
                        .or_default();

                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_item.added",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item": {
                                "id": item_id,
                                "type": "message",
                                "role": "assistant",
                                "status": "in_progress",
                                "content": [],
                            },
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.content_part.added",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "part": {
                                "type": "reasoning_text",
                                "text": "",
                            },
                        }),
                    )?;
                }
                "tool_use" => {
                    let call_id =
                        anthropic_tool_use_id(event.content_block.id.as_deref(), event.index);
                    let item_id = responses_function_item_id(&call_id, event.index);
                    let name = event.content_block.name.unwrap_or_default();
                    state
                        .content_block_kinds
                        .insert(event.index, StreamContentBlockKind::ToolUse);
                    state
                        .responses
                        .item_ids
                        .insert(event.index, item_id.clone());
                    state
                        .responses
                        .call_ids
                        .insert(event.index, call_id.clone());
                    state.responses.tool_names.insert(event.index, name.clone());
                    state
                        .responses
                        .function_arguments
                        .entry(event.index)
                        .or_default();

                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_item.added",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item": {
                                "id": item_id,
                                "type": "function_call",
                                "call_id": call_id,
                                "name": name,
                                "arguments": "",
                                "status": "in_progress",
                            },
                        }),
                    )?;
                }
                other => {
                    tracing::debug!(
                        "lossy downgrade: skipping unsupported Anthropic SSE content block type \
                         '{}'",
                        other
                    );
                }
            }
        }
        "content_block_delta" => {
            let event: AnthropicContentBlockDeltaEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "Anthropic content_block_delta parse: {e}"
                    ))
                })?;

            match event.delta.delta_type.as_str() {
                "text_delta" => {
                    let delta = event.delta.text.unwrap_or_default();
                    state
                        .responses
                        .text_fragments
                        .entry(event.index)
                        .or_default()
                        .push_str(&delta);
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_text.delta",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "delta": delta,
                        }),
                    )?;
                }
                "thinking_delta" => {
                    let delta = event.delta.thinking.unwrap_or_default();
                    state
                        .responses
                        .reasoning_fragments
                        .entry(event.index)
                        .or_default()
                        .push_str(&delta);
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.reasoning_text.delta",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "delta": delta,
                        }),
                    )?;
                }
                "input_json_delta" => {
                    let delta = event.delta.partial_json.unwrap_or_default();
                    state
                        .responses
                        .function_arguments
                        .entry(event.index)
                        .or_default()
                        .push_str(&delta);
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.function_call_arguments.delta",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "delta": delta,
                        }),
                    )?;
                }
                "signature_delta" => {}
                other => {
                    tracing::debug!(
                        "lossy downgrade: skipping unsupported Anthropic delta type '{}'",
                        other
                    );
                }
            }
        }
        "content_block_stop" => {
            let event: AnthropicContentBlockStopEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "Anthropic content_block_stop parse: {e}"
                    ))
                })?;

            match state.content_block_kinds.get(&event.index).copied() {
                Some(StreamContentBlockKind::Text) => {
                    let text = state
                        .responses
                        .text_fragments
                        .remove(&event.index)
                        .unwrap_or_default();
                    let part = json!({
                        "type": "output_text",
                        "text": text,
                        "annotations": [],
                    });
                    let item = build_responses_message_item_from_part(
                        &state.responses.item_ids[&event.index],
                        &part,
                        "completed",
                    );
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_text.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "text": text,
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.content_part.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "part": part,
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_item.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item": item,
                        }),
                    )?;
                }
                Some(StreamContentBlockKind::Thinking) => {
                    let text = state
                        .responses
                        .reasoning_fragments
                        .get(&event.index)
                        .cloned()
                        .unwrap_or_default();
                    let part = json!({
                        "type": "reasoning_text",
                        "text": text,
                    });
                    let item = build_responses_message_item_from_part(
                        &state.responses.item_ids[&event.index],
                        &part,
                        "completed",
                    );
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.reasoning_text.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "text": state.responses.reasoning_fragments[&event.index],
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.content_part.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "content_index": 0,
                            "part": part,
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_item.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item": item,
                        }),
                    )?;
                }
                Some(StreamContentBlockKind::ToolUse) => {
                    let arguments = state
                        .responses
                        .function_arguments
                        .get(&event.index)
                        .cloned()
                        .unwrap_or_default();
                    let item = build_responses_function_call_item(
                        &state.responses.item_ids[&event.index],
                        &state.responses.call_ids[&event.index],
                        &state.responses.tool_names[&event.index],
                        &arguments,
                        "completed",
                    );
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.function_call_arguments.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item_id": state.responses.item_ids[&event.index],
                            "name": state.responses.tool_names[&event.index],
                            "arguments": arguments,
                        }),
                    )?;
                    append_responses_sse_event(
                        out,
                        &json!({
                            "type": "response.output_item.done",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": event.index,
                            "item": item,
                        }),
                    )?;
                }
                None => {}
            }
        }
        "message_delta" => {
            let event: AnthropicMessageDeltaEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!("Anthropic message_delta parse: {e}"))
                })?;

            if let Some(usage) = event.usage {
                if let Some(input_tokens) = usage.input_tokens {
                    state.last_usage.input_tokens = input_tokens;
                }
                if let Some(output_tokens) = usage.output_tokens {
                    state.last_usage.output_tokens = output_tokens;
                }
            }

            state.responses.final_stop_reason = match event.delta.stop_reason.as_deref() {
                Some("end_turn" | "stop_sequence") => Some(StopReason::EndTurn),
                Some("max_tokens") => Some(StopReason::MaxTokens),
                Some("tool_use") => Some(StopReason::ToolUse),
                Some("content_filter") => Some(StopReason::ContentFilter),
                _ => state.responses.final_stop_reason,
            };
        }
        "message_stop" => {
            let (status, event_name, incomplete_reason) = match state.responses.final_stop_reason {
                Some(StopReason::MaxTokens) => (
                    "incomplete",
                    "response.incomplete",
                    Some("max_output_tokens"),
                ),
                Some(StopReason::ContentFilter) => {
                    ("incomplete", "response.incomplete", Some("content_filter"))
                }
                _ => ("completed", "response.completed", None),
            };
            append_responses_sse_event(
                out,
                &json!({
                    "type": event_name,
                    "sequence_number": next_responses_sequence_number(state),
                    "response": build_responses_stream_response(state, status, incomplete_reason),
                }),
            )?;
            if !state.finished {
                out.extend_from_slice(b"data: [DONE]\n\n");
                state.finished = true;
            }
        }
        "error" => {
            let event: AnthropicErrorEvent = serde_json::from_value(payload).map_err(|e| {
                TransformError::InvalidFormat(format!("Anthropic error event parse: {e}"))
            })?;
            let message = event
                .error
                .as_ref()
                .and_then(|error| error.message.as_deref())
                .unwrap_or("Anthropic upstream stream error")
                .to_string();
            let error_type = event
                .error
                .and_then(|error| error.r#type)
                .unwrap_or_else(|| "api_error".to_string());
            append_responses_sse_event(
                out,
                &json!({
                    "type": "error",
                    "sequence_number": next_responses_sequence_number(state),
                    "code": error_type,
                    "message": message,
                    "param": serde_json::Value::Null,
                }),
            )?;
            out.extend_from_slice(b"data: [DONE]\n\n");
            state.finished = true;
        }
        other => {
            tracing::debug!(
                "lossy downgrade: skipping unsupported Anthropic SSE event type '{}'",
                other
            );
        }
    }
    Ok(())
}

pub(crate) fn build_responses_message_item_from_part(
    item_id: &str,
    part: &serde_json::Value,
    status: &str,
) -> serde_json::Value {
    json!({
        "id": item_id,
        "type": "message",
        "role": "assistant",
        "status": status,
        "content": [part.clone()],
    })
}

pub(crate) fn build_responses_function_call_item(
    item_id: &str,
    call_id: &str,
    name: &str,
    arguments: &str,
    status: &str,
) -> serde_json::Value {
    json!({
        "id": item_id,
        "type": "function_call",
        "call_id": call_id,
        "name": name,
        "arguments": arguments,
        "status": status,
    })
}

pub(crate) fn build_responses_stream_response(
    state: &StreamState,
    status: &str,
    incomplete_reason: Option<&str>,
) -> serde_json::Value {
    let mut ordered_indices = BTreeMap::new();
    for (index, kind) in &state.content_block_kinds {
        ordered_indices.insert(*index, *kind);
    }

    let mut output = Vec::new();
    let mut output_text = Vec::new();
    for (index, kind) in ordered_indices {
        match kind {
            StreamContentBlockKind::Text => {
                let text = state
                    .responses
                    .text_fragments
                    .get(&index)
                    .cloned()
                    .unwrap_or_default();
                output_text.push(text.clone());
                output.push(build_responses_message_item_from_part(
                    state
                        .responses
                        .item_ids
                        .get(&index)
                        .map_or("msg_llm_bridge", String::as_str),
                    &json!({
                        "type": "output_text",
                        "text": text,
                        "annotations": [],
                    }),
                    "completed",
                ));
            }
            StreamContentBlockKind::Thinking => {
                output.push(build_responses_message_item_from_part(
                    state
                        .responses
                        .item_ids
                        .get(&index)
                        .map_or("msg_llm_bridge", String::as_str),
                    &json!({
                        "type": "reasoning_text",
                        "text": state
                            .responses.reasoning_fragments
                            .get(&index)
                            .cloned()
                            .unwrap_or_default(),
                    }),
                    "completed",
                ));
            }
            StreamContentBlockKind::ToolUse => output.push(build_responses_function_call_item(
                state
                    .responses
                    .item_ids
                    .get(&index)
                    .map_or("fc_llm_bridge", String::as_str),
                state
                    .responses
                    .call_ids
                    .get(&index)
                    .map_or("toolu_0", String::as_str),
                state
                    .responses
                    .tool_names
                    .get(&index)
                    .map_or("", String::as_str),
                state
                    .responses
                    .function_arguments
                    .get(&index)
                    .map_or("", String::as_str),
                "completed",
            )),
        }
    }

    let mut response = serde_json::Map::new();
    response.insert(
        "id".to_string(),
        serde_json::Value::String(responses_response_id(state)),
    );
    response.insert(
        "object".to_string(),
        serde_json::Value::String("response".to_string()),
    );
    response.insert(
        "created_at".to_string(),
        serde_json::Value::Number(serde_json::Number::from(
            state
                .responses
                .created_at
                .unwrap_or_else(current_unix_timestamp),
        )),
    );
    response.insert(
        "status".to_string(),
        serde_json::Value::String(status.to_string()),
    );
    response.insert(
        "model".to_string(),
        serde_json::Value::String(state.model_name.clone().unwrap_or_else(default_model_name)),
    );
    response.insert("output".to_string(), serde_json::Value::Array(output));
    response.insert(
        "output_text".to_string(),
        serde_json::Value::String(output_text.join("\n")),
    );
    response.insert("usage".to_string(), responses_usage_json(state));
    if let Some(reason) = incomplete_reason {
        response.insert(
            "incomplete_details".to_string(),
            json!({ "reason": reason }),
        );
    }

    serde_json::Value::Object(response)
}

pub(crate) fn responses_usage_json(state: &StreamState) -> serde_json::Value {
    json!({
        "input_tokens": state.last_usage.input_tokens,
        "input_tokens_details": {
            "cached_tokens": state.last_usage.cached_tokens,
        },
        "output_tokens": state.last_usage.output_tokens,
        "output_tokens_details": {
            "reasoning_tokens": state.last_usage.reasoning_tokens,
        },
        "total_tokens": state
            .last_usage
            .input_tokens
            .saturating_add(state.last_usage.output_tokens),
    })
}

pub(crate) fn append_responses_sse_event(
    out: &mut Vec<u8>,
    event: &serde_json::Value,
) -> Result<(), TransformError> {
    let data = serde_json::to_vec(event).map_err(|e| {
        TransformError::InvalidFormat(format!("Responses SSE serialization failed: {e}"))
    })?;
    out.extend_from_slice(b"data: ");
    out.extend_from_slice(&data);
    out.extend_from_slice(b"\n\n");
    Ok(())
}

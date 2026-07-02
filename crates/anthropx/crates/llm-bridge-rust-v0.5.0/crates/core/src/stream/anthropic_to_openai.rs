//! Anthropic-to-OpenAI Chat Completions SSE transformation.

use serde_json::json;

use super::{
    SseFrame,
    anthropic_types::{
        AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent,
        AnthropicMessageDeltaEvent, AnthropicMessageStartEvent,
    },
    frame_dispatch::{ParsedAnthropicEvent, parse_anthropic_stream_frames},
    openai_stream::{append_openai_sse_chunk, build_openai_chunk, openai_usage_json},
    sse_output::map_anthropic_stop_reason_to_openai_finish_reason,
};
use crate::model::{StreamState, TransformError};

pub(crate) fn transform_anthropic_stream_to_openai(
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
                if let Some(cache_read) = usage.cache_read_input_tokens {
                    state.last_usage.cache_read_input_tokens = cache_read;
                    state.last_usage.cached_tokens = cache_read;
                }
                if let Some(cache_create) = usage.cache_creation_input_tokens {
                    state.last_usage.cache_creation_input_tokens = cache_create;
                }
            }
            state.started = true;

            append_openai_sse_chunk(
                out,
                &build_openai_chunk(
                    state,
                    json!({
                        "role": event.message.role.unwrap_or_else(|| "assistant".to_string()),
                    }),
                    None,
                    None,
                ),
            )?;
        }
        "content_block_start" => {
            let event: AnthropicContentBlockStartEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "Anthropic content_block_start parse: {e}"
                    ))
                })?;

            if event.content_block.block_type == "tool_use" {
                append_openai_sse_chunk(
                    out,
                    &build_openai_chunk(
                        state,
                        json!({
                            "tool_calls": [{
                                "index": event.index,
                                "id": event.content_block.id.unwrap_or_default(),
                                "type": "function",
                                "function": {
                                    "name": event.content_block.name.unwrap_or_default(),
                                    "arguments": "",
                                },
                            }],
                        }),
                        None,
                        None,
                    ),
                )?;
            }
        }
        "content_block_delta" => {
            let event: AnthropicContentBlockDeltaEvent =
                serde_json::from_value(payload).map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "Anthropic content_block_delta parse: {e}"
                    ))
                })?;

            let delta = match event.delta.delta_type.as_str() {
                "text_delta" => Some(json!({
                    "content": event.delta.text.unwrap_or_default(),
                })),
                "thinking_delta" => Some(json!({
                    "reasoning_content": event.delta.thinking.unwrap_or_default(),
                })),
                "input_json_delta" => Some(json!({
                    "tool_calls": [{
                        "index": event.index,
                        "function": {
                            "arguments": event.delta.partial_json.unwrap_or_default(),
                        },
                    }],
                })),
                "signature_delta" => None,
                other => {
                    tracing::debug!(
                        "lossy downgrade: skipping unsupported Anthropic delta type '{}'",
                        other
                    );
                    None
                }
            };

            if let Some(delta) = delta {
                append_openai_sse_chunk(out, &build_openai_chunk(state, delta, None, None))?;
            }
        }
        "content_block_stop" => {}
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
                if let Some(cache_read) = usage.cache_read_input_tokens {
                    state.last_usage.cache_read_input_tokens = cache_read;
                    state.last_usage.cached_tokens = cache_read;
                }
                if let Some(cache_create) = usage.cache_creation_input_tokens {
                    state.last_usage.cache_creation_input_tokens = cache_create;
                }
            }

            let finish_reason = map_anthropic_stop_reason_to_openai_finish_reason(
                event.delta.stop_reason.as_deref(),
                event.delta.stop_sequence.as_deref(),
            );
            if finish_reason.is_some() {
                append_openai_sse_chunk(
                    out,
                    &build_openai_chunk(
                        state,
                        json!({}),
                        finish_reason,
                        Some(openai_usage_json(state)),
                    ),
                )?;
            }
        }
        "message_stop" => {
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
            append_openai_sse_chunk(
                out,
                &json!({
                    "error": {
                        "message": message,
                        "type": error_type,
                        "code": serde_json::Value::Null,
                    }
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

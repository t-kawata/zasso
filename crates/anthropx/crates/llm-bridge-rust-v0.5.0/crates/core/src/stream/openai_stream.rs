//! OpenAI-to-Anthropic stream transformation.

use serde_json::json;

use super::{
    SseFrame,
    openai_types::OpenAiChunk,
    stream_helpers::{
        anthropic_tool_use_id, default_model_name, default_openai_chunk_id, ensure_message_started,
        finalize_message, open_text_content_block, open_thinking_content_block,
        open_tool_use_content_block,
    },
};
use crate::model::{StopReason, StreamDelta, StreamEvent, StreamState, TransformError};

pub(crate) fn transform_openai_stream(
    frames: &[SseFrame],
    state: &mut StreamState,
) -> Result<Vec<StreamEvent>, TransformError> {
    if state.finished {
        return Ok(Vec::new());
    }

    let mut events: Vec<StreamEvent> = Vec::new();
    let mut finish_reason: Option<String> = None;
    let mut saw_done = false;

    for frame in frames {
        let data = &frame.data;

        if data.trim() == "[DONE]" {
            saw_done = true;
            continue;
        }

        let chunk: OpenAiChunk = serde_json::from_str(data)
            .map_err(|e| TransformError::InvalidFormat(format!("OpenAI chunk parse: {e}")))?;

        if let Some(id) = chunk.id.as_ref().filter(|value| !value.is_empty()) {
            state.message_id.get_or_insert_with(|| id.clone());
        }
        if state.model_name.is_none()
            && let Some(model) = chunk.model.as_ref().filter(|value| !value.is_empty())
        {
            state.model_name.get_or_insert_with(|| model.clone());
        }

        if let Some(ref usage) = chunk.usage {
            state.last_usage.input_tokens = usage.prompt_tokens.unwrap_or(0);
            state.last_usage.output_tokens = usage.completion_tokens.unwrap_or(0);
            if let Some(details) = &usage.prompt_tokens_details {
                let cached = details.cached_tokens.unwrap_or(0);
                state.last_usage.cached_tokens = cached;
                state.last_usage.cache_read_input_tokens = cached;
            }
            if let Some(details) = &usage.completion_tokens_details {
                let reasoning = details.reasoning_tokens.unwrap_or(0);
                state.last_usage.reasoning_tokens = reasoning;
            }
        }

        for choice in &chunk.choices {
            if let Some(ref reason) = choice.finish_reason {
                finish_reason = Some(reason.clone());
            }

            let Some(ref delta) = choice.delta else {
                continue;
            };
            let _chunk_index = choice.index.unwrap_or(0);

            if let Some(reasoning_content) = delta
                .reasoning_content
                .as_ref()
                .filter(|value| !value.is_empty())
            {
                ensure_message_started(&mut events, state);
                let index = open_thinking_content_block(&mut events, state);

                events.push(StreamEvent::ContentBlockDelta {
                    index,
                    delta: StreamDelta::Thinking {
                        thinking: reasoning_content.clone(),
                    },
                });
            }

            if let Some(ref content) = delta.content {
                ensure_message_started(&mut events, state);
                let index = open_text_content_block(&mut events, state);

                events.push(StreamEvent::ContentBlockDelta {
                    index,
                    delta: StreamDelta::Text {
                        text: content.clone(),
                    },
                });
            }

            if let Some(ref tool_calls) = delta.tool_calls {
                for tc in tool_calls {
                    let tc_index = tc.index.unwrap_or(0);

                    ensure_message_started(&mut events, state);

                    let id = anthropic_tool_use_id(tc.id.as_deref(), tc_index);
                    let name = tc
                        .function
                        .as_ref()
                        .and_then(|f| f.name.clone())
                        .unwrap_or_default();
                    let index = open_tool_use_content_block(&mut events, state, tc_index, id, name);

                    if let Some(args) = tc
                        .function
                        .as_ref()
                        .and_then(|function| function.arguments.clone())
                        .filter(|args| !args.is_empty())
                    {
                        events.push(StreamEvent::ContentBlockDelta {
                            index,
                            delta: StreamDelta::InputJson { partial_json: args },
                        });
                    }
                }
            }
        }
    }

    if finish_reason.is_some() || saw_done {
        let stop_reason = match finish_reason.as_deref() {
            Some("stop") => Some(StopReason::EndTurn),
            Some("length") => Some(StopReason::MaxTokens),
            Some("tool_calls") => Some(StopReason::ToolUse),
            Some("content_filter") => Some(StopReason::ContentFilter),
            None if saw_done => Some(StopReason::EndTurn),
            _ => None,
        };
        finalize_message(&mut events, state, stop_reason);
    }

    Ok(events)
}

pub(crate) fn build_openai_chunk(
    state: &StreamState,
    delta: serde_json::Value,
    finish_reason: Option<&'static str>,
    usage: Option<serde_json::Value>,
) -> serde_json::Value {
    let mut choice = serde_json::Map::new();
    choice.insert(
        "index".to_string(),
        serde_json::Value::Number(serde_json::Number::from(0)),
    );
    choice.insert("delta".to_string(), delta);
    if let Some(finish_reason) = finish_reason {
        choice.insert(
            "finish_reason".to_string(),
            serde_json::Value::String(finish_reason.to_string()),
        );
    }

    let mut chunk = serde_json::Map::new();
    chunk.insert(
        "id".to_string(),
        serde_json::Value::String(
            state
                .message_id
                .as_deref()
                .map_or_else(default_openai_chunk_id, str::to_string),
        ),
    );
    chunk.insert(
        "object".to_string(),
        serde_json::Value::String("chat.completion.chunk".to_string()),
    );
    chunk.insert(
        "model".to_string(),
        serde_json::Value::String(
            state
                .model_name
                .as_deref()
                .map_or_else(default_model_name, str::to_string),
        ),
    );
    chunk.insert(
        "choices".to_string(),
        serde_json::Value::Array(vec![serde_json::Value::Object(choice)]),
    );
    if let Some(usage) = usage {
        chunk.insert("usage".to_string(), usage);
    }

    serde_json::Value::Object(chunk)
}

pub(crate) fn append_openai_sse_chunk(
    out: &mut Vec<u8>,
    chunk: &serde_json::Value,
) -> Result<(), TransformError> {
    let data = serde_json::to_vec(&chunk)
        .map_err(|e| TransformError::InvalidFormat(format!("OpenAI chunk serialization: {e}")))?;
    out.extend_from_slice(b"data: ");
    out.extend_from_slice(&data);
    out.push(b'\n');
    out.push(b'\n');
    Ok(())
}

pub(crate) fn openai_usage_json(state: &StreamState) -> serde_json::Value {
    json!({
        "prompt_tokens": state.last_usage.input_tokens,
        "completion_tokens": state.last_usage.output_tokens,
        "total_tokens": state
            .last_usage
            .input_tokens
            .saturating_add(state.last_usage.output_tokens),
        "prompt_tokens_details": {
            "cached_tokens": state.last_usage.cache_read_input_tokens,
        },
        "completion_tokens_details": {
            "reasoning_tokens": state.last_usage.reasoning_tokens,
        },
    })
}

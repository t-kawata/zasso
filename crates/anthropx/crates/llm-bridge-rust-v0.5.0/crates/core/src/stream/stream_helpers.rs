//! Helper functions for stream transformation.

use std::time::{SystemTime, UNIX_EPOCH};

use crate::model::{StreamContentBlockKind, StreamDelta, StreamEvent, StreamState};

/// Synthetic signature appended to thinking content blocks when transitioning
/// from thinking to text content.
pub(crate) const SYNTHETIC_THINKING_SIGNATURE: &str =
    "bGxtLWJyaWRnZS1zeW50aGV0aWMtdGhpbmtpbmctc2lnbmF0dXJl";

pub(crate) fn default_message_id() -> String {
    "msg_llm_bridge".to_string()
}

pub(crate) fn default_openai_chunk_id() -> String {
    "chatcmpl_llm_bridge".to_string()
}

pub(crate) fn default_model_name() -> String {
    "llm-bridge".to_string()
}

pub(crate) fn current_unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

pub(crate) fn default_responses_id() -> String {
    "resp_llm_bridge".to_string()
}

pub(crate) fn next_responses_sequence_number(state: &mut StreamState) -> u64 {
    let sequence_number = state.responses.sequence_number;
    state.responses.sequence_number = state.responses.sequence_number.saturating_add(1);
    sequence_number
}

pub(crate) fn ensure_responses_created_at(state: &mut StreamState) -> u64 {
    if let Some(created_at) = state.responses.created_at {
        created_at
    } else {
        let created_at = current_unix_timestamp();
        state.responses.created_at = Some(created_at);
        created_at
    }
}

pub(crate) fn responses_response_id(state: &StreamState) -> String {
    state
        .message_id
        .clone()
        .unwrap_or_else(default_responses_id)
}

pub(crate) fn responses_message_item_id(state: &StreamState, index: usize) -> String {
    format!("{}_item_{index}", responses_response_id(state))
}

pub(crate) fn responses_function_item_id(call_id: &str, index: usize) -> String {
    format!("fc_{call_id}_{index}")
}

pub(crate) fn anthropic_tool_use_id(source_id: Option<&str>, index: usize) -> String {
    match source_id.filter(|value| !value.is_empty()) {
        // Strip Anthropic's "toolu_" prefix so the Responses call_id is clean.
        // The request-side conversion (openai_to_anthropic) will re-add the
        // prefix when sending back to the Anthropic API, preventing double-
        // prefix accumulation across round-trips.
        Some(value) if value.starts_with("toolu_") => {
            value.strip_prefix("toolu_").unwrap_or(value).to_string()
        }
        Some(value) => format!("toolu_{value}"),
        None => format!("toolu_{index}"),
    }
}

pub(crate) fn ensure_message_started(events: &mut Vec<StreamEvent>, state: &mut StreamState) {
    if !state.started {
        events.push(StreamEvent::MessageStart {
            role: "assistant".to_string(),
            message_id: state.message_id.clone().unwrap_or_else(default_message_id),
            model: state.model_name.clone().unwrap_or_else(default_model_name),
            usage: state.last_usage.clone(),
        });
        state.started = true;
    }
}

pub(crate) fn close_active_content_block(events: &mut Vec<StreamEvent>, state: &mut StreamState) {
    if let Some(index) = state.active_content_block_index.take() {
        events.push(StreamEvent::ContentBlockStop { index });
    }
    state.active_content_block_kind = None;
}

pub(crate) fn allocate_content_block_index(state: &mut StreamState) -> usize {
    let index = state.content_block_index;
    state.content_block_index += 1;
    index
}

pub(crate) fn close_thinking_content_block(events: &mut Vec<StreamEvent>, state: &mut StreamState) {
    if state.active_content_block_kind == Some(StreamContentBlockKind::Thinking)
        && let Some(index) = state.active_content_block_index
    {
        events.push(StreamEvent::ContentBlockDelta {
            index,
            delta: StreamDelta::Signature {
                signature: SYNTHETIC_THINKING_SIGNATURE.to_string(),
            },
        });
    }
    close_active_content_block(events, state);
}

pub(crate) fn open_text_content_block(
    events: &mut Vec<StreamEvent>,
    state: &mut StreamState,
) -> usize {
    if state.active_content_block_kind == Some(StreamContentBlockKind::Text)
        && let Some(index) = state.active_content_block_index
    {
        return index;
    }

    if state.active_content_block_kind == Some(StreamContentBlockKind::Thinking) {
        close_thinking_content_block(events, state);
    } else {
        close_active_content_block(events, state);
    }

    let index = allocate_content_block_index(state);

    events.push(StreamEvent::ContentBlockStart {
        index,
        content_block: crate::model::ContentBlock::Text {
            text: String::new(),
        },
    });
    state.active_content_block_index = Some(index);
    state.active_content_block_kind = Some(StreamContentBlockKind::Text);
    index
}

pub(crate) fn open_thinking_content_block(
    events: &mut Vec<StreamEvent>,
    state: &mut StreamState,
) -> usize {
    if state.active_content_block_kind == Some(StreamContentBlockKind::Thinking)
        && let Some(index) = state.active_content_block_index
    {
        return index;
    }

    close_active_content_block(events, state);

    let index = allocate_content_block_index(state);

    events.push(StreamEvent::ContentBlockStart {
        index,
        content_block: crate::model::ContentBlock::Thinking {
            text: String::new(),
            usage: None,
        },
    });
    state.active_content_block_index = Some(index);
    state.active_content_block_kind = Some(StreamContentBlockKind::Thinking);
    index
}

pub(crate) fn open_tool_use_content_block(
    events: &mut Vec<StreamEvent>,
    state: &mut StreamState,
    upstream_index: usize,
    id: String,
    name: String,
) -> usize {
    let index = if let Some(index) = state.tool_block_indices.get(&upstream_index).copied() {
        index
    } else {
        let index = allocate_content_block_index(state);
        state.tool_block_indices.insert(upstream_index, index);
        index
    };

    if state.active_content_block_kind == Some(StreamContentBlockKind::ToolUse)
        && state.active_content_block_index == Some(index)
    {
        return index;
    }

    if state.active_content_block_kind == Some(StreamContentBlockKind::Thinking) {
        close_thinking_content_block(events, state);
    } else {
        close_active_content_block(events, state);
    }

    events.push(StreamEvent::ContentBlockStart {
        index,
        content_block: crate::model::ContentBlock::ToolUse {
            id,
            name,
            input: serde_json::Value::Object(serde_json::Map::new()),
        },
    });
    state.active_content_block_index = Some(index);
    state.active_content_block_kind = Some(StreamContentBlockKind::ToolUse);
    index
}

pub(crate) fn finalize_message(
    events: &mut Vec<StreamEvent>,
    state: &mut StreamState,
    stop_reason: Option<crate::model::StopReason>,
) {
    if state.finished {
        return;
    }

    ensure_message_started(events, state);
    if state.active_content_block_kind == Some(StreamContentBlockKind::Thinking) {
        close_thinking_content_block(events, state);
    } else {
        close_active_content_block(events, state);
    }
    events.push(StreamEvent::MessageDelta {
        stop_reason,
        stop_sequence: None,
        usage: state.last_usage.clone(),
    });
    events.push(StreamEvent::MessageStop);
    state.finished = true;
    state.tool_block_indices.clear();
}

//! `OpenAI` Chat SSE → `OpenAI` Responses SSE transformation.
//!
//! Converts an upstream Chat Completions SSE stream into the Responses
//! API SSE format that Codex expects.

use serde_json::json;

use super::{
    SseFrame,
    anthropic_to_responses::build_responses_stream_response,
    openai_types::OpenAiChunk,
    stream_helpers::{
        ensure_responses_created_at, next_responses_sequence_number, responses_response_id,
    },
};
use crate::model::{StreamContentBlockKind, StreamState, TransformError};

pub(crate) fn transform_openai_stream_to_responses(
    frames: &[SseFrame],
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    if state.finished {
        return Ok(Vec::new());
    }

    let mut out = Vec::with_capacity(4096);
    let mut finish_reason: Option<String> = None;

    for frame in frames {
        let data = frame.data.trim();
        if data.is_empty() {
            continue;
        }
        if data == "[DONE]" {
            if !state.finished {
                if !state.started {
                    state.started = true;
                    let _ = ensure_responses_created_at(state);
                    let text_item_id = format!("{}_item_0", responses_response_id(state));
                    state.responses.item_ids.insert(0, text_item_id.clone());
                    state
                        .content_block_kinds
                        .insert(0, StreamContentBlockKind::Text);
                    state.responses.text_fragments.entry(0).or_default();
                    append_sse(
                        &mut out,
                        &json!({"type":"response.created","sequence_number":next_responses_sequence_number(state),"response":base_response(state)}),
                    )?;
                    append_sse(
                        &mut out,
                        &json!({"type":"response.in_progress","sequence_number":next_responses_sequence_number(state),"response":base_response(state)}),
                    )?;
                    append_sse(
                        &mut out,
                        &json!({"type":"response.output_item.added","sequence_number":next_responses_sequence_number(state),"output_index":0,"item":{"id":text_item_id,"type":"message","role":"assistant","status":"in_progress","content":[]}}),
                    )?;
                    append_sse(
                        &mut out,
                        &json!({"type":"response.content_part.added","sequence_number":next_responses_sequence_number(state),"output_index":0,"item_id":text_item_id,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}),
                    )?;
                }
                prune_empty_text(state);
                emit_done_events(&mut out, state)?;
                emit_response_completed(&mut out, state, finish_reason.as_deref(), true)?;
                state.finished = true;
            }
            continue;
        }

        let chunk: OpenAiChunk = serde_json::from_str(data)
            .map_err(|e| TransformError::InvalidFormat(format!("OpenAI chunk: {e}")))?;

        // ── Usage extraction (P0 fix #1) ───────────────────────────
        if let Some(ref usage) = chunk.usage {
            state.last_usage.input_tokens = usage.prompt_tokens.unwrap_or(0);
            state.last_usage.output_tokens = usage.completion_tokens.unwrap_or(0);
            if let Some(ref details) = usage.prompt_tokens_details {
                if let Some(cached) = details.cached_tokens {
                    state.last_usage.cached_tokens = cached;
                }
            }
            if let Some(ref details) = usage.completion_tokens_details {
                if let Some(reasoning) = details.reasoning_tokens {
                    state.last_usage.reasoning_tokens = reasoning;
                }
            }
        }

        // Track IDs
        if let Some(ref id) = chunk.id.filter(|v| !v.is_empty()) {
            state.message_id.get_or_insert_with(|| id.clone());
        }
        if state.model_name.is_none() {
            if let Some(ref model) = chunk.model.filter(|v| !v.is_empty()) {
                state.model_name = Some(model.clone());
            }
        }

        // ── First-chunk lifecycle ──────────────────────────────────
        if !state.started {
            state.started = true;
            let _ = ensure_responses_created_at(state);
            let text_item_id = format!("{}_item_0", responses_response_id(state));
            state.responses.item_ids.insert(0, text_item_id.clone());
            state
                .content_block_kinds
                .insert(0, StreamContentBlockKind::Text);
            state.responses.text_fragments.entry(0).or_default();

            append_sse(
                &mut out,
                &json!({
                    "type": "response.created",
                    "sequence_number": next_responses_sequence_number(state),
                    "response": base_response(state),
                }),
            )?;
            append_sse(
                &mut out,
                &json!({
                    "type": "response.in_progress",
                    "sequence_number": next_responses_sequence_number(state),
                    "response": base_response(state),
                }),
            )?;
            append_sse(
                &mut out,
                &json!({
                    "type": "response.output_item.added",
                    "sequence_number": next_responses_sequence_number(state),
                    "output_index": 0,
                    "item": {
                        "id": text_item_id,
                        "type": "message",
                        "role": "assistant",
                        "status": "in_progress",
                        "content": [],
                    },
                }),
            )?;
            append_sse(
                &mut out,
                &json!({
                    "type": "response.content_part.added",
                    "sequence_number": next_responses_sequence_number(state),
                    "output_index": 0,
                    "item_id": text_item_id,
                    "content_index": 0,
                    "part": {
                        "type": "output_text",
                        "text": "",
                        "annotations": [],
                    },
                }),
            )?;
        }

        for choice in &chunk.choices {
            if let Some(ref reason) = choice.finish_reason {
                finish_reason = Some(reason.clone());
            }
            let Some(ref delta) = choice.delta else {
                continue;
            };

            // Text content delta
            if let Some(ref content) = delta.content {
                if !content.is_empty() {
                    state
                        .responses
                        .text_fragments
                        .entry(0)
                        .or_default()
                        .push_str(content);
                    append_sse(
                        &mut out,
                        &json!({
                            "type": "response.output_text.delta",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": 0,
                            "item_id": state.responses.item_ids[&0],
                            "content_index": 0,
                            "delta": content,
                        }),
                    )?;
                }
            }

            // Reasoning content delta (P2 fix #7)
            if let Some(ref reasoning) = delta.reasoning_content {
                if !reasoning.is_empty() {
                    state
                        .responses
                        .reasoning_fragments
                        .entry(0)
                        .or_default()
                        .push_str(reasoning);
                    append_sse(
                        &mut out,
                        &json!({
                            "type": "response.reasoning_text.delta",
                            "sequence_number": next_responses_sequence_number(state),
                            "output_index": 0,
                            "item_id": state.responses.item_ids[&0],
                            "content_index": 0,
                            "delta": reasoning,
                        }),
                    )?;
                }
            }

            // Tool calls delta
            if let Some(ref tool_calls) = delta.tool_calls {
                for tc in tool_calls {
                    let idx = tc.index.unwrap_or(0);
                    let output_index = idx + 1;
                    let fallback_id = tc.id.clone().unwrap_or_else(|| format!("call_{idx}"));

                    // P2 fix #6: use state.responses.seen_tool_indices (persisted
                    // across incremental calls) instead of a function-local HashSet.
                    let is_new = state.responses.seen_tool_indices.insert(idx);
                    if is_new {
                        let name = tc
                            .function
                            .as_ref()
                            .and_then(|f| f.name.as_deref())
                            .filter(|n| !n.is_empty())
                            .unwrap_or("unknown");
                        let item_id =
                            format!("{}_item_f{output_index}", responses_response_id(state));
                        state
                            .content_block_kinds
                            .insert(output_index, StreamContentBlockKind::ToolUse);
                        state
                            .responses
                            .item_ids
                            .insert(output_index, item_id.clone());
                        state
                            .responses
                            .call_ids
                            .insert(output_index, fallback_id.clone());
                        state
                            .responses
                            .tool_names
                            .insert(output_index, name.to_string());
                        state
                            .responses
                            .function_arguments
                            .entry(output_index)
                            .or_default();
                        append_sse(
                            &mut out,
                            &json!({
                                "type": "response.output_item.added",
                                "sequence_number": next_responses_sequence_number(state),
                                "output_index": output_index,
                                "item": {
                                    "id": item_id,
                                    "type": "function_call",
                                    "call_id": fallback_id,
                                    "name": name,
                                    "arguments": "",
                                    "status": "in_progress",
                                },
                            }),
                        )?;
                    } else if let Some(func) = tc.function.as_ref() {
                        // P2 fix #6 (b): update tool name if it becomes available
                        // in a later chunk (DeepSeek may send name in a later delta).
                        if let Some(name) = func.name.as_deref().filter(|n| !n.is_empty()) {
                            if state
                                .responses
                                .tool_names
                                .get(&output_index)
                                .is_some_and(|existing| existing == "unknown")
                            {
                                state
                                    .responses
                                    .tool_names
                                    .insert(output_index, name.to_string());
                            }
                        }
                    }

                    if let Some(args) = tc.function.as_ref().and_then(|f| f.arguments.as_ref()) {
                        if !args.is_empty() {
                            state
                                .responses
                                .function_arguments
                                .entry(output_index)
                                .or_default()
                                .push_str(args);
                            let item_id = state.responses.item_ids[&output_index].clone();
                            append_sse(
                                &mut out,
                                &json!({
                                    "type": "response.function_call_arguments.delta",
                                    "sequence_number": next_responses_sequence_number(state),
                                    "output_index": output_index,
                                    "item_id": item_id,
                                    "delta": args,
                                }),
                            )?;
                        }
                    }
                }
            }
        }
    }

    // P0 fix #2: stream terminated without [DONE] but finish_reason was set.
    // Emit done events + response.completed so the client doesn't hang.
    if !state.finished && finish_reason.is_some() {
        prune_empty_text(state);
        emit_done_events(&mut out, state)?;
        emit_response_completed(&mut out, state, finish_reason.as_deref(), true)?;
        state.finished = true;
    }

    Ok(out)
}

// ── Helpers ──────────────────────────────────────────────────────────────

fn append_sse(out: &mut Vec<u8>, value: &serde_json::Value) -> Result<(), TransformError> {
    let json = serde_json::to_string(value)
        .map_err(|e| TransformError::InvalidFormat(format!("serialize SSE: {e}")))?;
    out.extend_from_slice(b"data: ");
    out.extend_from_slice(json.as_bytes());
    out.extend_from_slice(b"\n\n");
    Ok(())
}

fn base_response(state: &StreamState) -> serde_json::Value {
    let model = state.model_name.as_deref().unwrap_or("unknown");
    let id = state.message_id.as_deref().unwrap_or("0");
    json!({
        "id": id,
        "object": "response",
        "model": model,
        "status": "in_progress",
        "output": [],
    })
}

/// Remove empty text items from `content_block_kinds` so they don't
/// appear in the final `response.completed` output (P2 fix #5).
fn prune_empty_text(state: &mut StreamState) {
    if state
        .content_block_kinds
        .get(&0)
        .is_some_and(|kind| *kind == StreamContentBlockKind::Text)
        && state
            .responses
            .text_fragments
            .get(&0)
            .is_none_or(String::is_empty)
    {
        state.content_block_kinds.remove(&0);
    }
}

/// Emit incremental "done" events for all accumulated content blocks
/// (P1 fix #4). Called before `response.completed`.
fn emit_done_events(out: &mut Vec<u8>, state: &mut StreamState) -> Result<(), TransformError> {
    // Text item at output_index 0
    if state
        .content_block_kinds
        .get(&0)
        .is_some_and(|kind| *kind == StreamContentBlockKind::Text)
    {
        let text = state
            .responses
            .text_fragments
            .get(&0)
            .cloned()
            .unwrap_or_default();
        let item_id = state
            .responses
            .item_ids
            .get(&0)
            .cloned()
            .unwrap_or_default();

        append_sse(
            out,
            &json!({
                "type": "response.output_text.done",
                "sequence_number": next_responses_sequence_number(state),
                "output_index": 0,
                "item_id": item_id,
                "content_index": 0,
                "text": text,
            }),
        )?;
        append_sse(
            out,
            &json!({
                "type": "response.content_part.done",
                "sequence_number": next_responses_sequence_number(state),
                "output_index": 0,
                "item_id": item_id,
                "content_index": 0,
                "part": {
                    "type": "output_text",
                    "text": text,
                    "annotations": [],
                },
            }),
        )?;
        append_sse(
            out,
            &json!({
                "type": "response.output_item.done",
                "sequence_number": next_responses_sequence_number(state),
                "output_index": 0,
                "item": {
                    "id": item_id,
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{
                        "type": "output_text",
                        "text": text,
                        "annotations": [],
                    }],
                },
            }),
        )?;
    }

    // L6: Reasoning content done events (content_index 1, same output_index 0
    // as the text message item but semantically a separate content part).
    {
        let reasoning = state
            .responses
            .reasoning_fragments
            .get(&0)
            .cloned()
            .unwrap_or_default();
        if !reasoning.is_empty() {
            let item_id = state
                .responses
                .item_ids
                .get(&0)
                .cloned()
                .unwrap_or_default();

            append_sse(
                out,
                &json!({
                    "type": "response.reasoning_text.done",
                    "sequence_number": next_responses_sequence_number(state),
                    "output_index": 0,
                    "item_id": item_id,
                    "content_index": 0,
                    "text": reasoning,
                }),
            )?;
            append_sse(
                out,
                &json!({
                    "type": "response.content_part.done",
                    "sequence_number": next_responses_sequence_number(state),
                    "output_index": 0,
                    "item_id": item_id,
                    "content_index": 1,
                    "part": {
                        "type": "reasoning_text",
                        "text": reasoning,
                    },
                }),
            )?;
        }
    }

    // Tool call items (collect indices to avoid borrow conflicts)
    let tool_indices: Vec<usize> = state
        .content_block_kinds
        .iter()
        .filter(|(_, kind)| **kind == StreamContentBlockKind::ToolUse)
        .map(|(idx, _)| *idx)
        .collect();

    for output_index in tool_indices {
        let arguments = state
            .responses
            .function_arguments
            .get(&output_index)
            .cloned()
            .unwrap_or_default();
        let item_id = state
            .responses
            .item_ids
            .get(&output_index)
            .cloned()
            .unwrap_or_default();
        let name = state
            .responses
            .tool_names
            .get(&output_index)
            .cloned()
            .unwrap_or_default();

        append_sse(
            out,
            &json!({
                "type": "response.function_call_arguments.done",
                "sequence_number": next_responses_sequence_number(state),
                "output_index": output_index,
                "item_id": item_id,
                "name": name,
                "arguments": arguments,
            }),
        )?;
        append_sse(
            out,
            &json!({
                "type": "response.output_item.done",
                "sequence_number": next_responses_sequence_number(state),
                "output_index": output_index,
                "item": {
                    "id": item_id,
                    "type": "function_call",
                    "call_id": state.responses.call_ids.get(&output_index).cloned().unwrap_or_default(),
                    "name": name,
                    "arguments": arguments,
                    "status": "completed",
                },
            }),
        )?;
    }

    Ok(())
}

fn emit_response_completed(
    out: &mut Vec<u8>,
    state: &mut StreamState,
    finish_reason: Option<&str>,
    with_sse_framing: bool,
) -> Result<(), TransformError> {
    // P1 fix #3: "length" → incomplete / max_output_tokens
    let (status, incomplete_reason) = match finish_reason {
        Some("stop") | None => ("completed", None),
        Some("tool_calls" | "function_call") => ("completed", None),
        Some("length") => ("incomplete", Some("max_output_tokens")),
        Some("content_filter") => ("incomplete", Some("content_filter")),
        Some(other) => {
            tracing::debug!("unrecognized finish_reason: {other}");
            ("completed", None)
        }
    };

    let response = build_responses_stream_response(state, status, incomplete_reason);

    let event = json!({
        "type": format!("response.{status}"),
        "sequence_number": next_responses_sequence_number(state),
        "response": response,
    });

    if with_sse_framing {
        append_sse(out, &event)
    } else {
        out.extend_from_slice(
            serde_json::to_string(&event)
                .map_err(|e| TransformError::InvalidFormat(format!("serialize: {e}")))?
                .as_bytes(),
        );
        Ok(())
    }
}

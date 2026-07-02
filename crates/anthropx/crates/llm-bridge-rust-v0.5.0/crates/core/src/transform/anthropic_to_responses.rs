//! Anthropic → `OpenAI` Responses API request transform.
//!
//! Converts Anthropic Messages API requests into `OpenAI` Responses API requests
//! by mapping message structure, tools, and configuration fields.

#![allow(clippy::too_many_lines)]

use bytes::Bytes;
use serde_json::json;

use super::{
    anthropic_to_openai::{AnthropicBody, AnthropicToolChoice, parse_anthropic_body},
    response_transforms::extract_text_from_content,
};
use crate::model::{ApiFormat, TransformError, TransformRequest, TransformResponse};

/// Transform an Anthropic Messages request to an `OpenAI` Responses API request.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the request body cannot be parsed
/// as Anthropic JSON or if content blocks have missing required fields.
pub fn anthropic_to_openai_responses(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError> {
    let body: AnthropicBody = parse_anthropic_body(&req.body)?;

    // Validate messages array length.
    if body.messages.len() > crate::model::MAX_MESSAGES_COUNT {
        return Err(TransformError::BufferLimitExceeded(format!(
            "messages array length {} exceeds maximum of {}",
            body.messages.len(),
            crate::model::MAX_MESSAGES_COUNT
        )));
    }

    // Header mapping: x-api-key -> Authorization: Bearer
    let mut headers = std::collections::HashMap::new();
    if let Some(api_key) = req.headers.get("x-api-key") {
        headers.insert("authorization".to_string(), format!("Bearer {api_key}"));
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    // Path mapping: /v1/messages -> /v1/responses
    let path = "/v1/responses".to_string();

    // Build the input array for Responses API.
    let mut input_items: Vec<serde_json::Value> = Vec::new();

    // system -> instructions (top-level field in Responses)
    let instructions = body
        .system
        .as_ref()
        .filter(|s| !s.is_empty())
        .cloned()
        .map(serde_json::Value::String);

    // messages -> input items
    for msg in &body.messages {
        match &msg.content {
            None | Some(serde_json::Value::Null) => {
                // Skip empty content blocks — Responses API needs meaningful input.
            }
            Some(serde_json::Value::String(s)) => {
                // Plain string content -> single message input item.
                input_items.push(json!({
                    "type": "message",
                    "role": msg.role,
                    "content": [{"type": "input_text", "text": s}],
                }));
            }
            Some(serde_json::Value::Array(blocks)) => {
                let mut text_parts = Vec::new();
                let mut tool_calls: Vec<serde_json::Value> = Vec::new();
                let mut tool_result_items: Vec<serde_json::Value> = Vec::new();

                for block in blocks {
                    let block_type =
                        block.get("type").and_then(|v| v.as_str()).ok_or_else(|| {
                            TransformError::MissingRequiredField("content block 'type'".to_string())
                        })?;

                    match block_type {
                        "text" => {
                            let text =
                                block.get("text").and_then(|v| v.as_str()).ok_or_else(|| {
                                    TransformError::MissingRequiredField(
                                        "text block 'text' field".to_string(),
                                    )
                                })?;
                            text_parts.push(serde_json::Value::Object(serde_json::Map::from_iter(
                                [
                                    (
                                        "type".to_string(),
                                        serde_json::Value::String("input_text".to_string()),
                                    ),
                                    (
                                        "text".to_string(),
                                        serde_json::Value::String(text.to_string()),
                                    ),
                                ],
                            )));
                        }
                        "tool_use" => {
                            let id = block.get("id").and_then(|v| v.as_str()).ok_or_else(|| {
                                TransformError::MissingRequiredField(
                                    "tool_use block 'id' field".to_string(),
                                )
                            })?;
                            let name =
                                block.get("name").and_then(|v| v.as_str()).ok_or_else(|| {
                                    TransformError::MissingRequiredField(
                                        "tool_use block 'name' field".to_string(),
                                    )
                                })?;
                            let input = block
                                .get("input")
                                .cloned()
                                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

                            tool_calls.push(json!({
                                "type": "function_call",
                                "call_id": id,
                                "name": name,
                                "arguments": serde_json::to_string(&input).map_err(|e| {
                                    TransformError::InvalidFormat(format!("tool_use input serialization: {e}"))
                                })?,
                            }));
                        }
                        "tool_result" => {
                            let tool_use_id = block
                                .get("tool_use_id")
                                .and_then(|v| v.as_str())
                                .ok_or_else(|| {
                                    TransformError::MissingRequiredField(
                                        "tool_result block 'tool_use_id' field".to_string(),
                                    )
                                })?;
                            let content = block
                                .get("content")
                                .cloned()
                                .unwrap_or(serde_json::Value::String(String::new()));
                            let text = extract_text_from_content(&content);

                            tool_result_items.push(json!({
                                "type": "function_call_output",
                                "call_id": tool_use_id,
                                "output": text,
                            }));
                        }
                        "thinking" => {
                            tracing::debug!(
                                "lossy downgrade: skipping Anthropic thinking block in Responses \
                                 transform"
                            );
                        }
                        "image" => {
                            tracing::debug!(
                                "lossy downgrade: skipping image content block in Responses \
                                 transform"
                            );
                        }
                        other => {
                            tracing::debug!(
                                "lossy downgrade: skipping unsupported Anthropic content block \
                                 type '{other}' in Responses transform"
                            );
                        }
                    }
                }

                let has_text = !text_parts.is_empty();
                let has_tool_calls = !tool_calls.is_empty();
                let has_tool_results = !tool_result_items.is_empty();
                let had_content = has_text || has_tool_calls || has_tool_results;

                // If we have text, emit a message input item.
                if has_text {
                    input_items.push(json!({
                        "type": "message",
                        "role": msg.role,
                        "content": text_parts,
                    }));
                }

                // If we have tool_calls, emit function_call items (separate from message).
                for tc in tool_calls {
                    input_items.push(tc);
                }

                // Tool results go directly into input.
                input_items.extend(tool_result_items);

                // If all blocks were lossy-downgraded (thinking/image/unknown), emit a placeholder
                // so the message is not silently dropped.
                if !had_content {
                    tracing::debug!(
                        "lossy downgrade: message had only thinking/image/unknown blocks, \
                         emitting placeholder"
                    );
                    input_items.push(json!({
                        "type": "message",
                        "role": msg.role,
                        "content": [{"type": "input_text", "text": ""}],
                    }));
                }
            }
            other => {
                return Err(TransformError::InvalidFormat(format!(
                    "unexpected content type: {other:?}"
                )));
            }
        }
    }

    let mut body_obj = serde_json::Map::new();
    body_obj.insert("model".to_string(), serde_json::Value::String(body.model));
    body_obj.insert("input".to_string(), serde_json::Value::Array(input_items));

    if let Some(instructions) = instructions {
        body_obj.insert("instructions".to_string(), instructions);
    }

    if let Some(max_tokens) = body.max_tokens {
        body_obj.insert(
            "max_output_tokens".to_string(),
            serde_json::Value::Number(serde_json::Number::from(max_tokens)),
        );
    }
    if let Some(temperature) = body.temperature {
        body_obj.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(top_p) = body.top_p {
        body_obj.insert("top_p".to_string(), json!(top_p));
    }
    if let Some(ref stop) = body.stop_sequences {
        body_obj.insert("stop".to_string(), json!(stop));
    }
    if let Some(stream) = body.stream {
        body_obj.insert("stream".to_string(), serde_json::Value::Bool(stream));
    }

    // Anthropic thinking config: Responses API doesn't have an equivalent, so lossy downgrade.
    if body.thinking.is_some() {
        tracing::debug!(
            "lossy downgrade: skipping Anthropic thinking config in Responses transform"
        );
    }

    if let Some(ref tools) = body.tools {
        let responses_tools: Vec<_> = tools
            .iter()
            .map(|tool| -> serde_json::Value {
                let mut obj = serde_json::Map::new();
                obj.insert(
                    "type".to_string(),
                    serde_json::Value::String("function".to_string()),
                );
                obj.insert(
                    "name".to_string(),
                    serde_json::Value::String(tool.name.clone()),
                );
                if let Some(ref description) = tool.description {
                    obj.insert(
                        "description".to_string(),
                        serde_json::Value::String(description.clone()),
                    );
                }
                if let Some(ref parameters) = tool.input_schema {
                    obj.insert("parameters".to_string(), parameters.clone());
                }
                serde_json::Value::Object(obj)
            })
            .collect::<Vec<_>>();
        body_obj.insert(
            "tools".to_string(),
            serde_json::Value::Array(responses_tools),
        );
    }
    if let Some(ref tool_choice) = body.tool_choice {
        let responses_tool_choice = anthropic_tool_choice_to_responses(tool_choice)?;
        body_obj.insert("tool_choice".to_string(), responses_tool_choice);
    }

    let body_bytes = serde_json::to_vec(&serde_json::Value::Object(body_obj))
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    Ok(TransformResponse {
        headers,
        path,
        body: Bytes::from(body_bytes),
        conversion_trail: vec![ApiFormat::AnthropicMessages, ApiFormat::OpenaiResponses],
    })
}

/// Map Anthropic `tool_choice` to Responses API `tool_choice` format.
fn anthropic_tool_choice_to_responses(
    choice: &AnthropicToolChoice,
) -> Result<serde_json::Value, TransformError> {
    match choice.choice_type.as_str() {
        "auto" => Ok(serde_json::Value::String("auto".to_string())),
        "none" => Ok(serde_json::Value::String("none".to_string())),
        "any" => Ok(serde_json::Value::String("required".to_string())),
        "tool" => {
            let name = choice.name.as_ref().ok_or_else(|| {
                TransformError::MissingRequiredField("tool_choice.name for type 'tool'".to_string())
            })?;
            Ok(json!({
                "type": "function",
                "name": name,
            }))
        }
        other => Err(TransformError::InvalidFormat(format!(
            "unsupported Anthropic tool_choice type: {other}"
        ))),
    }
}

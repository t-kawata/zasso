//! Responses API → Anthropic request transform.
//!
//! Converts `OpenAI` Responses API requests into Anthropic Messages requests
//! by normalizing to a synthetic Chat Completions request first.

#![allow(clippy::too_many_lines)]

use bytes::Bytes;
use serde::Deserialize;
use serde_json::json;

use super::openai_to_anthropic;
use crate::model::{
    ApiFormat, MAX_MESSAGES_COUNT, TransformError, TransformRequest, TransformResponse,
    validate_json_depth,
};

// ---------------------------------------------------------------------------
// Responses request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct OpenAiResponsesRequestBody {
    pub(crate) model: String,
    #[serde(default)]
    pub(crate) input: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) instructions: Option<String>,
    #[serde(default)]
    pub(crate) tools: Option<Vec<OpenAiResponsesTool>>,
    #[serde(default)]
    pub(crate) tool_choice: Option<serde_json::Value>,
    #[serde(default, rename = "max_output_tokens")]
    pub(crate) max_output_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) temperature: Option<f64>,
    #[serde(default)]
    pub(crate) stream: Option<bool>,
    #[serde(default, rename = "previous_response_id")]
    pub(crate) previous_response_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponsesTool {
    #[serde(default, rename = "type")]
    pub(crate) tool_type: String,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) parameters: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

pub(crate) fn parse_openai_responses_request_body(
    bytes: &Bytes,
) -> Result<OpenAiResponsesRequestBody, TransformError> {
    if bytes.len() > crate::model::MAX_REQUEST_BODY_BYTES {
        return Err(TransformError::BufferLimitExceeded(format!(
            "request body {} bytes exceeds maximum of {}",
            bytes.len(),
            crate::model::MAX_REQUEST_BODY_BYTES
        )));
    }
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| TransformError::InvalidFormat("invalid JSON body".into()))?;
    validate_json_depth(&value)?;
    let parsed: OpenAiResponsesRequestBody = serde_json::from_value(value)
        .map_err(|_| TransformError::InvalidFormat("invalid response structure".into()))?;
    crate::model::validate_model_name(&parsed.model)?;
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Responses → Anthropic
// ---------------------------------------------------------------------------

/// Transform an `OpenAI` Responses API request to an Anthropic Messages request.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the Responses request body cannot
/// be parsed or normalized into a synthetic Chat Completions request.
pub fn responses_to_anthropic(req: &TransformRequest) -> Result<TransformResponse, TransformError> {
    let body: OpenAiResponsesRequestBody = parse_openai_responses_request_body(&req.body)?;

    if body.previous_response_id.is_some() {
        tracing::debug!(
            "lossy downgrade: ignoring Responses API previous_response_id in stateless transform"
        );
    }

    let mut messages = Vec::new();
    if let Some(instructions) = body
        .instructions
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        messages.push(json!({
            "role": "system",
            "content": instructions,
        }));
    }
    let input_messages = responses_input_to_chat_messages(body.input.as_ref())?;

    // Validate total messages array length (prevents unbounded memory allocation).
    if messages.len() + input_messages.len() > MAX_MESSAGES_COUNT {
        return Err(TransformError::BufferLimitExceeded(format!(
            "messages array length {} exceeds maximum of {}",
            messages.len() + input_messages.len(),
            MAX_MESSAGES_COUNT
        )));
    }

    messages.extend(input_messages);

    let mut synthetic_body = serde_json::Map::new();
    synthetic_body.insert("model".to_string(), serde_json::Value::String(body.model));
    synthetic_body.insert("messages".to_string(), serde_json::Value::Array(messages));

    if let Some(max_output_tokens) = body.max_output_tokens {
        synthetic_body.insert(
            "max_tokens".to_string(),
            serde_json::Value::Number(max_output_tokens.into()),
        );
    }
    if let Some(temperature) = body.temperature {
        synthetic_body.insert(
            "temperature".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(temperature)
                    .map_or(serde_json::Number::from(0), |n| n),
            ),
        );
    }
    if let Some(stream) = body.stream {
        synthetic_body.insert("stream".to_string(), serde_json::Value::Bool(stream));
    }
    if let Some(ref tools) = body.tools {
        synthetic_body.insert(
            "tools".to_string(),
            serde_json::Value::Array(responses_tools_to_chat_tools(tools)?),
        );
    }
    if let Some(ref tool_choice) = body.tool_choice {
        synthetic_body.insert(
            "tool_choice".to_string(),
            normalize_responses_tool_choice(tool_choice)?,
        );
    }

    let synthetic_request = TransformRequest {
        headers: req.headers.clone(),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&serde_json::Value::Object(synthetic_body)).map_err(|e| {
                TransformError::InvalidFormat(format!(
                    "Responses synthetic request serialization failed: {e}"
                ))
            })?,
        ),
    };

    let mut response = openai_to_anthropic(&synthetic_request)?;
    // Override conversion_trail: the source format is OpenaiResponses,
    // not OpenaiChat (which is the intermediate normalized format).
    response.conversion_trail = vec![ApiFormat::OpenaiResponses, ApiFormat::AnthropicMessages];
    Ok(response)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

pub(crate) fn responses_tools_to_chat_tools(
    tools: &[OpenAiResponsesTool],
) -> Result<Vec<serde_json::Value>, TransformError> {
    let mut chat_tools = Vec::new();

    for tool in tools {
        if !tool.tool_type.is_empty() && tool.tool_type != "function" {
            tracing::debug!(
                "lossy downgrade: skipping unsupported Responses tool type '{}'",
                tool.tool_type
            );
            continue;
        }

        let name = tool.name.as_ref().ok_or_else(|| {
            TransformError::MissingRequiredField("Responses tools[].name".to_string())
        })?;

        let mut function = serde_json::Map::new();
        function.insert("name".to_string(), serde_json::Value::String(name.clone()));
        if let Some(description) = &tool.description {
            function.insert(
                "description".to_string(),
                serde_json::Value::String(description.clone()),
            );
        }
        // Sanitize parameters: skip null, clean nested null-in-array issues.
        // Some validators (`DeepSeek`) reject functions without a valid
        // `parameters` schema, so provide a minimal empty schema as fallback.
        if let Some(parameters) = &tool.parameters {
            let mut cleaned = sanitize_json_schema(parameters);
            if cleaned.is_null() {
                function.insert(
                    "parameters".to_string(),
                    serde_json::json!({"type": "object", "properties": {}, "required": []}),
                );
            } else {
                ensure_required_array(&mut cleaned);
                function.insert("parameters".to_string(), cleaned);
            }
        } else {
            function.insert(
                "parameters".to_string(),
                serde_json::json!({"type": "object", "properties": {}, "required": []}),
            );
        }

        chat_tools.push(json!({
            "type": "function",
            "function": serde_json::Value::Object(function),
        }));
    }

    Ok(chat_tools)
}

/// Recursively sanitize a JSON Schema object so it is safe for strict
/// Chat Completions API validators (e.g. `DeepSeek`).
///
/// - Top-level `null` → returned as-is (caller skips insertion).
/// - Fields whose key suggests an array type (`required`, `enum`, `anyOf`, `oneOf`, `allOf`) but
///   contain `null` → replaced with `[]`.
/// - Other `null` values → removed from the object.
/// - Nested objects/arrays are recursed into.
fn sanitize_json_schema(value: &serde_json::Value) -> serde_json::Value {
    match value {
        // Top-level null → nothing useful to forward
        serde_json::Value::Null => serde_json::Value::Null,
        serde_json::Value::Array(arr) => {
            let cleaned: Vec<serde_json::Value> = arr
                .iter()
                .map(sanitize_json_schema)
                .filter(|v| !v.is_null())
                .collect();
            serde_json::Value::Array(cleaned)
        }
        serde_json::Value::Object(map) => {
            let mut cleaned = serde_json::Map::new();
            for (key, val) in map {
                if val.is_null() {
                    // Fields that validators expect to be arrays:
                    // replace null with [] instead of removing.
                    if is_schema_array_field(key) {
                        cleaned.insert(key.clone(), serde_json::Value::Array(Vec::new()));
                    }
                    // For other keys, just omit null values.
                    continue;
                }
                cleaned.insert(key.clone(), sanitize_json_schema(val));
            }
            serde_json::Value::Object(cleaned)
        }
        // Scalars (string, number, bool) pass through unchanged
        other => other.clone(),
    }
}

/// Returns `true` when the given key represents a JSON Schema field that must
/// be an array (e.g. `required`, `enum`, `anyOf`).
fn is_schema_array_field(key: &str) -> bool {
    matches!(
        key,
        "required"
            | "enum"
            | "anyOf"
            | "oneOf"
            | "allOf"
            | "items"
            | "prefixItems"
            | "examples"
            | "dependentRequired"
    )
}

/// Ensure a JSON Schema object has a `required` array field.
///
/// Some strict validators (`DeepSeek`) reject schemas with `type: "object"` and
/// `properties` but no `required` field.
fn ensure_required_array(schema: &mut serde_json::Value) {
    if let Some(obj) = schema.as_object_mut()
        && obj.contains_key("properties")
        && !obj.contains_key("required")
    {
        obj.insert("required".to_string(), serde_json::Value::Array(Vec::new()));
    }
}

pub(crate) fn normalize_responses_tool_choice(
    tool_choice: &serde_json::Value,
) -> Result<serde_json::Value, TransformError> {
    match tool_choice {
        serde_json::Value::String(choice) => match choice.as_str() {
            "auto" | "none" | "required" => Ok(serde_json::Value::String(choice.clone())),
            other => Err(TransformError::InvalidFormat(format!(
                "unsupported Responses tool_choice string: {other}"
            ))),
        },
        serde_json::Value::Object(map) => {
            let choice_type = map
                .get("type")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            match choice_type {
                "function" => {
                    let name = map
                        .get("name")
                        .and_then(serde_json::Value::as_str)
                        .or_else(|| {
                            map.get("function")
                                .and_then(|value| value.get("name"))
                                .and_then(serde_json::Value::as_str)
                        })
                        .ok_or_else(|| {
                            TransformError::MissingRequiredField(
                                "Responses tool_choice.name".to_string(),
                            )
                        })?;
                    Ok(json!({
                        "type": "function",
                        "function": {
                            "name": name,
                        },
                    }))
                }
                "auto" | "none" | "required" => {
                    Ok(serde_json::Value::String(choice_type.to_string()))
                }
                other => Err(TransformError::InvalidFormat(format!(
                    "unsupported Responses tool_choice object type: {other}"
                ))),
            }
        }
        other => Err(TransformError::InvalidFormat(format!(
            "unsupported Responses tool_choice type: {other:?}"
        ))),
    }
}

pub(crate) fn responses_input_to_chat_messages(
    input: Option<&serde_json::Value>,
) -> Result<Vec<serde_json::Value>, TransformError> {
    match input {
        None | Some(serde_json::Value::Null) => Ok(Vec::new()),
        Some(serde_json::Value::String(text)) => Ok(vec![json!({
            "role": "user",
            "content": text,
        })]),
        Some(serde_json::Value::Array(items)) => {
            let mut messages = Vec::new();
            // Accumulate consecutive function_call items so they are merged
            // into a single assistant message (OpenAI Chat format requires all
            // tool_calls from one turn to live in one message).
            let mut pending_tool_calls: Vec<serde_json::Value> = Vec::new();
            let mut pending_call_ids: Vec<String> = Vec::new();

            for item in items {
                let item_type = item
                    .get("type")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");
                let role = item
                    .get("role")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");

                // Flush pending tool calls when we see a non-function_call item
                // (except function_call_output which always follows function_calls).
                if item_type != "function_call" && !pending_tool_calls.is_empty() {
                    messages.push(json!({
                        "role": "assistant",
                        "content": "",
                        "tool_calls": std::mem::take(&mut pending_tool_calls),
                    }));
                    pending_call_ids.clear();
                }

                // For non-function_call output: flush pending BEFORE the output.
                if item_type == "function_call_output" && !pending_tool_calls.is_empty() {
                    messages.push(json!({
                        "role": "assistant",
                        "content": "",
                        "tool_calls": std::mem::take(&mut pending_tool_calls),
                    }));
                    pending_call_ids.clear();
                }

                if item_type == "function_call" {
                    let call_id = item
                        .get("call_id")
                        .and_then(serde_json::Value::as_str)
                        .ok_or_else(|| {
                            TransformError::MissingRequiredField(
                                "Responses function_call.call_id".to_string(),
                            )
                        })?;
                    let name = item
                        .get("name")
                        .and_then(serde_json::Value::as_str)
                        .ok_or_else(|| {
                            TransformError::MissingRequiredField(
                                "Responses function_call.name".to_string(),
                            )
                        })?;
                    let arguments = item
                        .get("arguments")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    // Deduplicate by call_id — Codex may re-send function_call items.
                    if !pending_call_ids.contains(&call_id.to_string()) {
                        pending_call_ids.push(call_id.to_string());
                        pending_tool_calls.push(json!({
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": arguments,
                            },
                        }));
                    }
                } else if role == "tool" || item_type == "function_call_output" {
                    // function_call_output → tool message directly
                    let call_id = if item_type == "function_call_output" {
                        item.get("call_id")
                            .and_then(serde_json::Value::as_str)
                            .ok_or_else(|| {
                                TransformError::MissingRequiredField(
                                    "Responses function_call_output.call_id".to_string(),
                                )
                            })?
                    } else {
                        item.get("tool_call_id")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("")
                    };
                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": if item_type == "function_call_output" {
                            responses_content_to_text(item.get("output"))
                        } else {
                            responses_content_to_text(item.get("content"))
                        },
                    }));
                } else {
                    // Regular message — use the existing converter
                    messages.extend(responses_input_item_to_chat_messages(item)?);
                }
            }

            // Flush any remaining pending tool calls
            if !pending_tool_calls.is_empty() {
                messages.push(json!({
                    "role": "assistant",
                    "content": "",
                    "tool_calls": std::mem::take(&mut pending_tool_calls),
                }));
            }

            Ok(messages)
        }
        Some(serde_json::Value::Object(obj)) => {
            let item: serde_json::Value = serde_json::Value::Object(obj.clone());
            responses_input_item_to_chat_messages(&item)
        }
        Some(other) => Err(TransformError::InvalidFormat(format!(
            "unsupported Responses input type: {other:?}"
        ))),
    }
}

pub(crate) fn responses_input_item_to_chat_messages(
    item: &serde_json::Value,
) -> Result<Vec<serde_json::Value>, TransformError> {
    let item_type = item.get("type").and_then(serde_json::Value::as_str);

    match item_type {
        Some("message") | None if item.get("role").is_some() => {
            let role = item
                .get("role")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    TransformError::MissingRequiredField("Responses message.role".to_string())
                })?;
            let chat_role = match role {
                "developer" => "system",
                "system" | "user" | "assistant" | "tool" => role,
                other => {
                    tracing::debug!(
                        "lossy downgrade: mapping unsupported Responses role '{}' to 'user'",
                        other
                    );
                    "user"
                }
            };
            Ok(vec![json!({
                "role": chat_role,
                "content": responses_content_to_text(item.get("content")),
            })])
        }
        Some("function_call_output") => {
            let call_id = item
                .get("call_id")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    TransformError::MissingRequiredField(
                        "Responses function_call_output.call_id".to_string(),
                    )
                })?;
            Ok(vec![json!({
                "role": "tool",
                "tool_call_id": call_id,
                "content": responses_content_to_text(item.get("output")),
            })])
        }
        Some("function_call") => {
            let call_id = item
                .get("call_id")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    TransformError::MissingRequiredField(
                        "Responses function_call.call_id".to_string(),
                    )
                })?;
            let name = item
                .get("name")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    TransformError::MissingRequiredField("Responses function_call.name".to_string())
                })?;
            let arguments = item
                .get("arguments")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            Ok(vec![json!({
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": arguments,
                    },
                }],
            })])
        }
        Some("reasoning") => {
            tracing::debug!("lossy downgrade: skipping standalone Responses reasoning input item");
            Ok(Vec::new())
        }
        Some(other) => {
            tracing::debug!(
                "lossy downgrade: skipping unsupported Responses input item type '{}'",
                other
            );
            Ok(Vec::new())
        }
        None => Ok(Vec::new()),
    }
}

pub(crate) fn responses_content_to_text(content: Option<&serde_json::Value>) -> String {
    match content {
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(serde_json::Value::Array(parts)) => parts
            .iter()
            .filter_map(response_content_part_to_text)
            .collect::<Vec<_>>()
            .join("\n"),
        Some(serde_json::Value::Object(obj)) => {
            let part: serde_json::Value = serde_json::Value::Object(obj.clone());
            response_content_part_to_text(&part).unwrap_or_default()
        }
        _ => String::new(),
    }
}

pub(crate) fn response_content_part_to_text(part: &serde_json::Value) -> Option<String> {
    match part {
        serde_json::Value::String(text) => Some(text.clone()),
        serde_json::Value::Object(map) => map
            .get("text")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
        _ => None,
    }
}

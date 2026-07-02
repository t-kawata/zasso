//! Anthropic → `OpenAI` request transform.
//!
//! Contains the `anthropic_to_openai()` function, Anthropic request types,
//! and the `deserialize_system` helper.

#![allow(clippy::too_many_lines)]

use std::collections::HashMap;

use bytes::Bytes;
use serde::Deserialize;
use serde_json::json;

use super::response_transforms::extract_text_from_content;
use crate::model::{
    ApiFormat, TransformError, TransformRequest, TransformResponse, validate_json_depth,
};

// ---------------------------------------------------------------------------
// Anthropic request types (input)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicMessage {
    pub(crate) role: String,
    pub(crate) content: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicToolDef {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: Option<String>,
    #[serde(default, rename = "input_schema")]
    pub(crate) input_schema: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicToolChoice {
    #[serde(rename = "type")]
    pub(crate) choice_type: String,
    #[serde(default)]
    pub(crate) name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(crate) struct AnthropicThinkingConfig {
    #[serde(rename = "type")]
    pub(crate) thinking_type: String,
    #[serde(default)]
    pub(crate) budget_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) display: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
// NOTE: deny_unknown_fields intentionally NOT applied — Claude Code and
// other Anthropic SDK clients may send fields we don't model (metadata,
// cache_control, anthropic_version, etc.). Silently ignoring them is the
// correct behavior for a protocol proxy.
pub(crate) struct AnthropicBody {
    pub(crate) model: String,
    pub(crate) messages: Vec<AnthropicMessage>,
    #[serde(default)]
    pub(crate) max_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) temperature: Option<f64>,
    #[serde(default)]
    pub(crate) top_p: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_system")]
    pub(crate) system: Option<String>,
    #[serde(default)]
    pub(crate) stop_sequences: Option<Vec<String>>,
    #[serde(default)]
    pub(crate) stream: Option<bool>,
    #[serde(default)]
    pub(crate) tools: Option<Vec<AnthropicToolDef>>,
    #[serde(default)]
    pub(crate) tool_choice: Option<AnthropicToolChoice>,
    #[serde(default)]
    pub(crate) thinking: Option<AnthropicThinkingConfig>,
}

// ---------------------------------------------------------------------------
// Deserialization helpers
// ---------------------------------------------------------------------------

/// Deserialize `system` field which may be a plain string (legacy) or an
/// array of content blocks (newer Anthropic API format).
pub(crate) fn deserialize_system<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(opt.map(|v| match v {
        serde_json::Value::String(s) => s,
        serde_json::Value::Array(blocks) => blocks
            .iter()
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _other => {
            tracing::debug!("lossy downgrade: unexpected system field type, using empty string");
            String::new()
        }
    }))
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

pub(crate) fn parse_anthropic_body(body: &Bytes) -> Result<AnthropicBody, TransformError> {
    // H5: enforce request body size limit
    if body.len() > crate::model::MAX_REQUEST_BODY_BYTES {
        return Err(TransformError::BufferLimitExceeded(format!(
            "request body {} bytes exceeds maximum of {}",
            body.len(),
            crate::model::MAX_REQUEST_BODY_BYTES
        )));
    }
    let value: serde_json::Value = serde_json::from_slice(body)
        .map_err(|_| TransformError::InvalidFormat("invalid JSON body".into()))?;
    validate_json_depth(&value)?;
    let parsed: AnthropicBody = serde_json::from_value(value)
        .map_err(|_| TransformError::InvalidFormat("invalid request structure".into()))?;
    crate::model::validate_model_name(&parsed.model)?;
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Anthropic → OpenAI
// ---------------------------------------------------------------------------

/// Transform an Anthropic Messages request to an `OpenAI` Chat Completions request.
///
/// Maps headers, path, and body per spec [10 §2.4.1, §2.4.2].
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the request body cannot be parsed
/// as Anthropic JSON or if content blocks have missing required fields.
pub fn anthropic_to_openai(req: &TransformRequest) -> Result<TransformResponse, TransformError> {
    let body: AnthropicBody = parse_anthropic_body(&req.body)?;

    // Validate messages array length (prevents unbounded memory allocation).
    if body.messages.len() > crate::model::MAX_MESSAGES_COUNT {
        return Err(TransformError::BufferLimitExceeded(format!(
            "messages array length {} exceeds maximum of {}",
            body.messages.len(),
            crate::model::MAX_MESSAGES_COUNT
        )));
    }

    // M4: validate tool schema sizes
    if let Some(ref tools) = body.tools {
        for tool in tools {
            if let Some(ref schema) = tool.input_schema {
                crate::model::validate_tool_schema_size(schema)?;
            }
        }
    }

    // Header mapping: x-api-key -> Authorization: Bearer
    let mut headers = HashMap::new();
    if let Some(api_key) = req.headers.get("x-api-key") {
        headers.insert("authorization".to_string(), format!("Bearer {api_key}"));
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    // Path mapping: /v1/messages -> /v1/chat/completions
    let path = "/v1/chat/completions".to_string();

    // Body mapping
    let mut messages: Vec<serde_json::Value> = Vec::new();

    // system -> messages[0].role=system
    if let Some(ref system) = body.system {
        messages.push(json!({
            "role": "system",
            "content": system,
        }));
    }

    for msg in &body.messages {
        match &msg.content {
            None | Some(serde_json::Value::Null) => {
                messages.push(json!({
                    "role": msg.role,
                    "content": ""
                }));
            }
            Some(serde_json::Value::String(s)) => {
                messages.push(json!({
                    "role": msg.role,
                    "content": s.clone()
                }));
            }
            Some(serde_json::Value::Array(blocks)) => {
                let mut text_parts = String::new();
                let mut tool_calls: Vec<serde_json::Value> = Vec::new();
                let mut tool_result_messages: Vec<serde_json::Value> = Vec::new();

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
                            if !text_parts.is_empty() {
                                text_parts.push('\n');
                            }
                            text_parts.push_str(text);
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
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": serde_json::to_string(&input).map_err(|e| {
                                        TransformError::InvalidFormat(format!("tool_use input serialization: {e}"))
                                    })?,
                                },
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

                            tool_result_messages.push(json!({
                                "role": "tool",
                                "tool_call_id": tool_use_id,
                                "content": text,
                            }));
                        }
                        "image" => {
                            tracing::debug!("lossy downgrade: skipping image content block");
                        }
                        _ => {
                            tracing::debug!(
                                "lossy downgrade: skipping unsupported Anthropic content block \
                                 type '{block_type}'"
                            );
                        }
                    }
                }

                let has_tool_calls = !tool_calls.is_empty();
                let has_text = !text_parts.is_empty();

                if has_text || has_tool_calls || tool_result_messages.is_empty() {
                    let mut obj = serde_json::Map::new();
                    obj.insert(
                        "role".to_string(),
                        serde_json::Value::String(msg.role.clone()),
                    );
                    if has_tool_calls {
                        obj.insert(
                            "tool_calls".to_string(),
                            serde_json::Value::Array(tool_calls),
                        );
                    }
                    if has_text {
                        obj.insert("content".to_string(), serde_json::Value::String(text_parts));
                    }
                    if !obj.contains_key("content") {
                        obj.insert(
                            "content".to_string(),
                            serde_json::Value::String(String::new()),
                        );
                    }
                    messages.push(serde_json::Value::Object(obj));
                }

                messages.extend(tool_result_messages);
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
    body_obj.insert("messages".to_string(), serde_json::Value::Array(messages));

    if let Some(max_tokens) = body.max_tokens {
        body_obj.insert(
            "max_tokens".to_string(),
            serde_json::Value::Number(max_tokens.into()),
        );
    }
    if let Some(temperature) = body.temperature {
        body_obj.insert(
            "temperature".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(temperature)
                    .map_or(serde_json::Number::from(0), |n| n),
            ),
        );
    }
    if let Some(top_p) = body.top_p {
        body_obj.insert(
            "top_p".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(top_p).map_or(serde_json::Number::from(0), |n| n),
            ),
        );
    }
    if let Some(ref stop) = body.stop_sequences {
        body_obj.insert("stop".to_string(), json!(stop));
    }
    if let Some(stream) = body.stream {
        body_obj.insert("stream".to_string(), serde_json::Value::Bool(stream));
    }
    // `thinking` is Anthropic-specific — strip it from the OpenAI request body.
    // OpenAI Chat Completions has no equivalent parameter.
    if let Some(ref thinking) = body.thinking {
        tracing::debug!(
            thinking_type = %thinking.thinking_type,
            "stripping Anthropic-specific `thinking` config from OpenAI request"
        );
    }
    let mut tools_truncated = false;
    if let Some(ref tools) = body.tools {
        let tool_count = tools.len();
        let effective_tools: &[AnthropicToolDef] = if tool_count > crate::model::OPENAI_MAX_TOOLS {
            tracing::warn!(
                "lossy downgrade: truncating {tool_count} tools to {} (OpenAI limit)",
                crate::model::OPENAI_MAX_TOOLS
            );
            tools_truncated = true;
            &tools[..crate::model::OPENAI_MAX_TOOLS]
        } else {
            tools.as_slice()
        };

        let openai_tools = effective_tools
            .iter()
            .map(|tool| {
                let mut function = serde_json::Map::new();
                function.insert(
                    "name".to_string(),
                    serde_json::Value::String(tool.name.clone()),
                );
                if let Some(description) = &tool.description {
                    function.insert(
                        "description".to_string(),
                        serde_json::Value::String(description.clone()),
                    );
                }
                if let Some(parameters) = &tool.input_schema {
                    function.insert("parameters".to_string(), parameters.clone());
                }

                json!({
                    "type": "function",
                    "function": serde_json::Value::Object(function),
                })
            })
            .collect::<Vec<_>>();
        body_obj.insert("tools".to_string(), serde_json::Value::Array(openai_tools));
    }
    if let Some(ref tool_choice) = body.tool_choice {
        let openai_tool_choice = match tool_choice.choice_type.as_str() {
            "auto" => serde_json::Value::String("auto".to_string()),
            "any" => serde_json::Value::String("required".to_string()),
            "none" => serde_json::Value::String("none".to_string()),
            "tool" => {
                let Some(name) = tool_choice.name.as_ref() else {
                    return Err(TransformError::MissingRequiredField(
                        "tool_choice.name for type 'tool'".to_string(),
                    ));
                };
                // If tools were truncated and the requested tool was dropped,
                // fall back to "auto" to avoid OpenAI rejecting the request.
                if tools_truncated
                    && !body.tools.as_ref().is_some_and(|tools| {
                        tools[..crate::model::OPENAI_MAX_TOOLS]
                            .iter()
                            .any(|t| &t.name == name)
                    })
                {
                    tracing::warn!(
                        "lossy downgrade: tool_choice name '{name}' was truncated, falling back \
                         to auto"
                    );
                    serde_json::Value::String("auto".to_string())
                } else {
                    json!({
                        "type": "function",
                        "function": {
                            "name": name,
                        },
                    })
                }
            }
            other => {
                return Err(TransformError::InvalidFormat(format!(
                    "unsupported Anthropic tool_choice type: {other}"
                )));
            }
        };
        body_obj.insert("tool_choice".to_string(), openai_tool_choice);
    }

    let body_bytes = serde_json::to_vec(&serde_json::Value::Object(body_obj))
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    Ok(TransformResponse {
        headers,
        path,
        body: Bytes::from(body_bytes),
        conversion_trail: vec![ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat],
    })
}

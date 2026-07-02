//! `OpenAI` → Anthropic request transform.
//!
//! Contains the `openai_to_anthropic()` function, `OpenAI` request types,
//! and the `parse_openai_body` helper.

#![allow(clippy::too_many_lines)]

use std::collections::HashMap;

use bytes::Bytes;
use serde::Deserialize;
use serde_json::json;

use super::response_transforms::{openai_tool_choice_to_anthropic, openai_tool_to_anthropic_tool};
use crate::model::{
    ApiFormat, TransformError, TransformRequest, TransformResponse, validate_json_depth,
};

// ---------------------------------------------------------------------------
// OpenAI request types
// ---------------------------------------------------------------------------

// NOTE: `usage` and `choices` are response-only fields accepted here because
// this struct is also used as a deserializer for OpenAI response bodies in
// fixture-driven tests (e.g., openai_response_to_anthropic_message).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OpenAiRequestBody {
    pub(crate) model: String,
    pub(crate) messages: Vec<OpenAiRequestMessage>,
    #[serde(default)]
    pub(crate) max_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) temperature: Option<f64>,
    #[serde(default)]
    pub(crate) stop: Option<Vec<String>>,
    #[serde(default)]
    pub(crate) stream: Option<bool>,
    #[serde(default)]
    pub(crate) tools: Option<Vec<OpenAiRequestTool>>,
    #[serde(default)]
    pub(crate) tool_choice: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) enable_thinking: Option<bool>,
    #[serde(default)]
    #[allow(dead_code)]
    pub(crate) usage: Option<serde_json::Value>,
    #[serde(default)]
    #[allow(dead_code)]
    pub(crate) choices: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiRequestMessage {
    pub(crate) role: String,
    #[serde(default)]
    pub(crate) content: Option<String>,
    #[serde(default, rename = "tool_call_id")]
    pub(crate) tool_call_id: Option<String>,
    #[serde(default, rename = "tool_calls")]
    pub(crate) tool_calls: Option<Vec<OpenAiToolCallDef>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(crate) struct OpenAiToolCallDef {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) r#type: String,
    pub(crate) function: OpenAiToolCallFunction,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiToolCallFunction {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) arguments: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(crate) struct OpenAiRequestTool {
    #[serde(default, rename = "type")]
    pub(crate) tool_type: String,
    #[serde(default)]
    pub(crate) function: Option<OpenAiRequestToolFunction>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiRequestToolFunction {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) parameters: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

pub(crate) fn parse_openai_body(bytes: &Bytes) -> Result<OpenAiRequestBody, TransformError> {
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
    let parsed: OpenAiRequestBody = serde_json::from_value(value)
        .map_err(|_| TransformError::InvalidFormat("invalid request structure".into()))?;
    crate::model::validate_model_name(&parsed.model)?;
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// OpenAI → Anthropic
// ---------------------------------------------------------------------------

/// Transform an `OpenAI` Chat Completions request to an Anthropic Messages request.
///
/// Maps headers, path, and body per spec [10 §2.4.4].
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the request body cannot be parsed
/// as `OpenAI` JSON or if messages have missing required fields.
#[allow(clippy::match_same_arms)]
pub fn openai_to_anthropic(req: &TransformRequest) -> Result<TransformResponse, TransformError> {
    let body: OpenAiRequestBody = parse_openai_body(&req.body)?;

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
            if let Some(ref func) = tool.function
                && let Some(ref params) = func.parameters
            {
                crate::model::validate_tool_schema_size(params)?;
            }
        }
    }

    // Header mapping: Authorization: Bearer -> x-api-key
    let mut headers = HashMap::new();
    if let Some(auth) = req.headers.get("authorization")
        && let Some(token) = auth.strip_prefix("Bearer ")
    {
        headers.insert("x-api-key".to_string(), token.to_string());
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    // Path mapping: /v1/chat/completions -> /v1/messages
    let path = "/v1/messages".to_string();

    // Body mapping
    let mut messages: Vec<serde_json::Value> = Vec::new();

    for msg in &body.messages {
        match msg.role.as_str() {
            "system" => {
                // In Anthropic, system prompt is a top-level field, not a message.
                // Unknown roles are silently ignored.
            }
            "user" => {
                messages.push(json!({
                    "role": "user",
                    "content": msg.content.as_ref().map_or(serde_json::Value::String(String::new()), |c| {
                        serde_json::Value::Array(vec![json!({ "type": "text", "text": c })])
                    }),
                }));
            }
            "assistant" => {
                let has_tool_calls = msg
                    .tool_calls
                    .as_ref()
                    .is_some_and(|tc: &Vec<OpenAiToolCallDef>| !tc.is_empty());
                let content_str = msg.content.as_deref().unwrap_or("");

                if has_tool_calls {
                    let Some(tool_calls) = msg.tool_calls.as_ref() else {
                        unreachable!("has_tool_calls is true, so tool_calls must be Some")
                    };
                    let mut content_blocks: Vec<serde_json::Value> = Vec::new();

                    if !content_str.is_empty() {
                        content_blocks.push(json!({ "type": "text", "text": content_str }));
                    }

                    for tc in tool_calls {
                        let clean_id = tc.id.strip_prefix("toolu_").unwrap_or(&tc.id);
                        let id = format!("toolu_{clean_id}");
                        let args: serde_json::Value = serde_json::from_str(&tc.function.arguments)
                            .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

                        content_blocks.push(json!({
                            "type": "tool_use",
                            "id": id,
                            "name": tc.function.name,
                            "input": args,
                        }));
                    }

                    messages.push(json!({
                        "role": "assistant",
                        "content": content_blocks,
                    }));
                } else {
                    messages.push(json!({
                        "role": "assistant",
                        "content": [{ "type": "text", "text": content_str }],
                    }));
                }
            }
            "tool" => {
                let tool_call_id = msg.tool_call_id.clone().unwrap_or_default();
                let clean_id = tool_call_id.strip_prefix("toolu_").unwrap_or(&tool_call_id);
                let content_text = msg.content.as_deref().unwrap_or("");

                messages.push(json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": format!("toolu_{clean_id}"),
                        "content": [{ "type": "text", "text": content_text }],
                        "is_error": false,
                    }],
                }));
            }
            _ => {
                tracing::debug!(
                    "lossy downgrade: mapping unknown role '{}' to 'user'",
                    msg.role
                );
            }
        }
    }

    let mut body_obj = serde_json::Map::new();
    body_obj.insert("model".to_string(), serde_json::Value::String(body.model));
    body_obj.insert("messages".to_string(), serde_json::Value::Array(messages));

    // System prompt as top-level field
    let systems: Vec<&str> = body
        .messages
        .iter()
        .filter(|m| m.role == "system")
        .filter_map(|m| m.content.as_deref())
        .collect();
    if !systems.is_empty() {
        body_obj.insert(
            "system".to_string(),
            serde_json::Value::String(systems.join("\n")),
        );
    }

    if let Some(max_tokens) = body.max_tokens {
        body_obj.insert(
            "max_tokens".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_i128(i128::from(max_tokens))
                    .unwrap_or(serde_json::Number::from(0)),
            ),
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
    if let Some(stop) = &body.stop {
        body_obj.insert("stop_sequences".to_string(), json!(stop));
    }
    if let Some(stream) = body.stream {
        body_obj.insert("stream".to_string(), serde_json::Value::Bool(stream));
    }
    if let Some(enable_thinking) = body.enable_thinking {
        if enable_thinking {
            // Anthropic requires `budget_tokens` (>= 1024) when type is "enabled".
            body_obj.insert(
                "thinking".to_string(),
                json!({
                    "type": "enabled",
                    "budget_tokens": 4096,
                }),
            );
        } else {
            body_obj.insert(
                "thinking".to_string(),
                json!({
                    "type": "disabled",
                }),
            );
        }
    }
    if let Some(ref tools) = body.tools {
        let anthropic_tools = tools
            .iter()
            .map(openai_tool_to_anthropic_tool)
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|tool| !tool.is_null())
            .collect::<Vec<_>>();
        if !anthropic_tools.is_empty() {
            body_obj.insert(
                "tools".to_string(),
                serde_json::Value::Array(anthropic_tools),
            );
        }
    }
    if let Some(ref tool_choice) = body.tool_choice {
        let anthropic_tool_choice = openai_tool_choice_to_anthropic(tool_choice)?;
        body_obj.insert("tool_choice".to_string(), anthropic_tool_choice);
    }

    let body_bytes = serde_json::to_vec(&serde_json::Value::Object(body_obj))
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    Ok(TransformResponse {
        headers,
        path,
        body: Bytes::from(body_bytes),
        conversion_trail: vec![ApiFormat::OpenaiChat, ApiFormat::AnthropicMessages],
    })
}

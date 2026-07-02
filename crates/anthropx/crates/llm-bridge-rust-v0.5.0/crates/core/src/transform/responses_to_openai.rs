//! Responses API → `OpenAI` Chat Completions request transform.
//!
//! Normalizes a Responses API request into a synthetic Chat Completions
//! request by reusing the shared normalization helpers from the
//! `responses_to_anthropic` module.

#![allow(clippy::too_many_lines)]

use bytes::Bytes;

use super::responses_to_anthropic::{
    OpenAiResponsesRequestBody, normalize_responses_tool_choice,
    parse_openai_responses_request_body, responses_input_to_chat_messages,
    responses_tools_to_chat_tools,
};
use crate::model::{ApiFormat, TransformError, TransformRequest, TransformResponse};

/// Transform an `OpenAI` Responses API request into an `OpenAI` Chat
/// Completions request.
///
/// The request body is normalized to a synthetic `/v1/chat/completions`
/// payload.  Unlike `responses_to_anthropic`, this function stops at the
/// Chat Completions representation — no further Anthropic conversion is
/// needed because the target speaks Chat Completions natively.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the Responses request body
/// cannot be parsed or normalized.
pub fn responses_to_openai(req: &TransformRequest) -> Result<TransformResponse, TransformError> {
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
        messages.push(serde_json::json!({
            "role": "system",
            "content": instructions,
        }));
    }
    let input_messages = responses_input_to_chat_messages(body.input.as_ref())?;

    // Validate total messages array length.
    if messages.len() + input_messages.len() > crate::model::MAX_MESSAGES_COUNT {
        return Err(TransformError::BufferLimitExceeded(format!(
            "messages array length {} exceeds maximum of {}",
            messages.len() + input_messages.len(),
            crate::model::MAX_MESSAGES_COUNT
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
                serde_json::Number::from_f64(temperature).unwrap_or(serde_json::Number::from(0)),
            ),
        );
    }
    if let Some(stream) = body.stream {
        synthetic_body.insert("stream".to_string(), serde_json::Value::Bool(stream));
    }
    if let Some(ref tools) = body.tools {
        let converted = responses_tools_to_chat_tools(tools)?;
        tracing::debug!(
            tools_before = tools.len(),
            tools_after = converted.len(),
            "Responses tools → Chat Completions tools"
        );
        synthetic_body.insert("tools".to_string(), serde_json::Value::Array(converted));
    }
    if let Some(ref tool_choice) = body.tool_choice {
        synthetic_body.insert(
            "tool_choice".to_string(),
            normalize_responses_tool_choice(tool_choice)?,
        );
    }

    // Final safety net: strip all null values so strict validators (DeepSeek
    // et al.) never receive `null` where a proper value is expected.
    let cleaned =
        crate::transform::shared::strip_all_nulls(&serde_json::Value::Object(synthetic_body));

    // Log tools after cleaning so we can see which field is still null.
    if let Some(tools) = cleaned.get("tools").and_then(|v| v.as_array()) {
        for tool in tools {
            let name = tool
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let params = tool.get("function").and_then(|f| f.get("parameters"));
            tracing::info!(tool_name = name, cleaned_parameters = ?params, "responses→openai tool after strip");
        }
    }

    let out_body = serde_json::to_vec(&cleaned)
        .map_err(|e| TransformError::InvalidFormat(format!("serialization: {e}")))?;

    Ok(TransformResponse {
        headers: req.headers.clone(),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(out_body),
        conversion_trail: vec![ApiFormat::OpenaiResponses, ApiFormat::OpenaiChat],
    })
}

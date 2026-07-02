//! Response transformation functions and `OpenAI` response types.
//!
//! Handles Anthropic ↔ `OpenAI` response conversions and Anthropic → Responses
//! response conversions.

#![allow(clippy::too_many_lines)]

use std::collections::{BTreeMap, HashMap};

use bytes::Bytes;
use serde::Deserialize;
use serde_json::json;

use super::{
    openai_to_anthropic::OpenAiToolCallDef,
    responses_to_anthropic::responses_content_to_text,
    shared::{
        SYNTHETIC_THINKING_SIGNATURE, current_unix_timestamp, default_model_name,
        default_responses_id,
    },
};
use crate::model::{
    ApiFormat, TransformError, TransformRequest, TransformResponse, validate_json_depth,
};

// ---------------------------------------------------------------------------
// OpenAI response types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponseBody {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) choices: Vec<OpenAiResponseChoice>,
    #[serde(default)]
    pub(crate) usage: Option<OpenAiResponseUsage>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponseChoice {
    #[serde(default, rename = "finish_reason")]
    pub(crate) finish_reason: Option<String>,
    #[serde(default)]
    pub(crate) message: Option<OpenAiResponseMessage>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponseMessage {
    #[serde(default)]
    pub(crate) role: Option<String>,
    #[serde(default)]
    pub(crate) content: Option<serde_json::Value>,
    #[serde(default, rename = "reasoning_content")]
    pub(crate) reasoning_content: Option<serde_json::Value>,
    #[serde(default, rename = "tool_calls")]
    pub(crate) tool_calls: Option<Vec<OpenAiToolCallDef>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponseUsage {
    #[serde(default, rename = "prompt_tokens")]
    pub(crate) prompt_tokens: Option<u64>,
    #[serde(default, rename = "completion_tokens")]
    pub(crate) completion_tokens: Option<u64>,
    #[serde(default, rename = "prompt_tokens_details")]
    pub(crate) prompt_tokens_details: Option<PromptTokensDetails>,
    #[serde(default, rename = "completion_tokens_details")]
    #[allow(dead_code)]
    pub(crate) completion_tokens_details: Option<CompletionTokensDetails>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PromptTokensDetails {
    #[serde(default)]
    pub(crate) cached_tokens: u64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CompletionTokensDetails {
    #[serde(default)]
    #[allow(dead_code)]
    pub(crate) reasoning_tokens: u64,
}

// ---------------------------------------------------------------------------
// Body parsing helpers
// ---------------------------------------------------------------------------

pub(crate) fn parse_openai_response_body(
    bytes: &Bytes,
) -> Result<OpenAiResponseBody, TransformError> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| TransformError::InvalidFormat("invalid JSON body".into()))?;
    validate_json_depth(&value)?;
    serde_json::from_value(value)
        .map_err(|_| TransformError::InvalidFormat("invalid response structure".into()))
}

pub(crate) fn parse_anthropic_response_body(
    bytes: &Bytes,
) -> Result<AnthropicResponseBody, TransformError> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| TransformError::InvalidFormat("invalid JSON body".into()))?;
    validate_json_depth(&value)?;
    serde_json::from_value(value)
        .map_err(|_| TransformError::InvalidFormat("invalid response structure".into()))
}

// ---------------------------------------------------------------------------
// OpenAI Responses API response types
// ---------------------------------------------------------------------------

/// OpenAI Responses API の非ストリーミングレスポンスボディ。
///
/// OpenAI は頻繁に新フィールドを追加するため、`#[serde(deny_unknown_fields)]` は
/// 使用せず、未知フィールドは `extra` にフラット収集する。
/// 変換ロジックが必要とするフィールドのみを明示的に定義し、それ以外は `Option` で
/// 安全に無視する。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
struct ResponsesResponseBody {
    // --- 変換ロジックで使用する必須フィールド ---
    // status が "failed" の場合の検出に使用
    status: Option<String>,
    // status→stop_reason マッピングで使用
    incomplete_details: Option<serde_json::Value>,
    // 出力 content の構築に使用
    #[serde(default)]
    output: Vec<serde_json::Value>,
    // Anthropic レスポンスの model に設定
    model: Option<String>,
    // Anthropic レスポンスの id に設定
    id: Option<String>,
    // Anthropic レスポンスの usage に設定
    usage: Option<ResponsesResponseUsage>,

    // --- 変換ロジックでは使用しないが、未知フィールドエラーを防ぐために列挙 ---
    #[serde(default)]
    object: Option<String>,
    #[serde(default)]
    created_at: Option<i64>,
    #[serde(default)]
    completed_at: Option<i64>,
    #[serde(default)]
    error: Option<serde_json::Value>,
    #[serde(default)]
    instructions: Option<String>,
    #[serde(default)]
    max_output_tokens: Option<u32>,
    #[serde(default)]
    parallel_tool_calls: Option<bool>,
    #[serde(default)]
    previous_response_id: Option<String>,
    #[serde(default)]
    reasoning: Option<serde_json::Value>,
    #[serde(default)]
    store: Option<bool>,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    text: Option<serde_json::Value>,
    #[serde(default)]
    tool_choice: Option<serde_json::Value>,
    #[serde(default)]
    tools: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    top_p: Option<f64>,
    #[serde(default)]
    top_logprobs: Option<u32>,
    #[serde(default)]
    truncation: Option<String>,
    #[serde(default)]
    user: Option<String>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
    #[serde(default)]
    background: Option<bool>,
    #[serde(default)]
    billing: Option<serde_json::Value>,
    #[serde(default)]
    service_tier: Option<String>,
    #[serde(default)]
    prompt_cache_key: Option<String>,
    #[serde(default)]
    prompt_cache_retention: Option<String>,
    #[serde(default)]
    safety_identifier: Option<String>,

    // 上記で列挙しきれなかった未知フィールドをここで捕捉
    #[serde(flatten)]
    extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
struct ResponsesResponseUsage {
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    input_tokens_details: Option<ResponsesInputTokensDetails>,
    #[serde(default)]
    output_tokens_details: Option<serde_json::Value>,
    #[serde(default)]
    total_tokens: Option<u64>,
    #[serde(flatten)]
    extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ResponsesInputTokensDetails {
    #[serde(default)]
    cached_tokens: u64,
}

/// `OpenAI` Responses API レスポンスボディをパースする。
fn parse_responses_response_body(
    bytes: &Bytes,
) -> Result<ResponsesResponseBody, TransformError> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| TransformError::InvalidFormat("invalid JSON body".into()))?;
    validate_json_depth(&value)?;
    serde_json::from_value(value).map_err(|e| {
        TransformError::InvalidFormat(format!("invalid Responses response structure: {e}"))
    })
}

// ---------------------------------------------------------------------------
// Anthropic response type
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicResponseBody {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) role: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) content: Vec<serde_json::Value>,
    #[serde(default)]
    pub(crate) stop_reason: Option<String>,
    #[serde(default)]
    pub(crate) stop_sequence: Option<String>,
    #[serde(default)]
    pub(crate) usage: Option<AnthropicResponseUsage>,
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_field_names)]
pub(crate) struct AnthropicResponseUsage {
    #[serde(default)]
    pub(crate) input_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) output_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) cache_read_input_tokens: Option<u64>,
    #[serde(default)]
    #[allow(dead_code)]
    pub(crate) cache_creation_input_tokens: Option<u64>,
}

// ---------------------------------------------------------------------------
// Anthropic response → OpenAI Chat Completions response
// ---------------------------------------------------------------------------

/// Transform an Anthropic Messages response to an `OpenAI` Chat Completions response.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the response body cannot be parsed
/// or if required content-block fields are missing.
pub fn anthropic_response_to_openai_response(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError> {
    let body: AnthropicResponseBody = parse_anthropic_response_body(&req.body)?;

    let mut headers = HashMap::new();
    if let Some(api_key) = req.headers.get("x-api-key") {
        headers.insert("authorization".to_string(), format!("Bearer {api_key}"));
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    let path = "/v1/chat/completions".to_string();
    let (reasoning_content, content_text, tool_calls) =
        extract_openai_message_fields_from_anthropic_content(&body.content)?;

    let mut message = serde_json::Map::new();
    message.insert(
        "role".to_string(),
        serde_json::Value::String(body.role.clone().unwrap_or_else(|| "assistant".to_string())),
    );
    message.insert(
        "content".to_string(),
        serde_json::Value::String(content_text),
    );
    if !reasoning_content.is_empty() {
        message.insert(
            "reasoning_content".to_string(),
            serde_json::Value::String(reasoning_content),
        );
    }
    if !tool_calls.is_empty() {
        message.insert(
            "tool_calls".to_string(),
            serde_json::Value::Array(tool_calls),
        );
    }

    let prompt_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.input_tokens)
        .unwrap_or_default();
    let completion_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.output_tokens)
        .unwrap_or_default();
    let cache_read_input_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.cache_read_input_tokens)
        .unwrap_or_default();

    let openai_response = json!({
        "id": body.id.as_deref().unwrap_or("chatcmpl-proxy"),
        "object": "chat.completion",
        "model": body.model.as_deref().unwrap_or("unknown"),
        "choices": [{
            "index": 0,
            "message": serde_json::Value::Object(message),
            "finish_reason": map_anthropic_stop_reason_to_openai_finish_reason(
                body.stop_reason.as_deref(),
                body.stop_sequence.as_deref(),
            ),
        }],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens.saturating_add(completion_tokens),
            "prompt_tokens_details": {
                "cached_tokens": cache_read_input_tokens,
            },
            "completion_tokens_details": {
                // Anthropic API does not report reasoning tokens separately;
                // thinking tokens are included in completion_tokens.
                "reasoning_tokens": 0,
            },
        },
    });

    let response_body = serde_json::to_vec(&openai_response)
        .map(Bytes::from)
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    Ok(TransformResponse {
        headers,
        path,
        body: response_body,
        conversion_trail: vec![ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat],
    })
}

// ---------------------------------------------------------------------------
// Anthropic response → OpenAI Responses response
// ---------------------------------------------------------------------------

/// Transform an Anthropic Messages response to an `OpenAI` Responses API response.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the response body cannot be parsed
/// or if required content-block fields are missing.
pub fn anthropic_response_to_responses_response(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError> {
    let body: AnthropicResponseBody = parse_anthropic_response_body(&req.body)?;

    let mut headers = HashMap::new();
    if let Some(api_key) = req.headers.get("x-api-key") {
        headers.insert("authorization".to_string(), format!("Bearer {api_key}"));
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    let path = "/v1/responses".to_string();
    let response_id = body.id.clone().unwrap_or_else(default_responses_id);
    let (output, output_text) = anthropic_content_to_responses_output(&body.content, &response_id)?;
    let prompt_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.input_tokens)
        .unwrap_or_default();
    let completion_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.output_tokens)
        .unwrap_or_default();
    let (status, incomplete_details) =
        anthropic_stop_reason_to_responses_status(body.stop_reason.as_deref());

    let mut response = serde_json::Map::new();
    response.insert("id".to_string(), serde_json::Value::String(response_id));
    response.insert(
        "object".to_string(),
        serde_json::Value::String("response".to_string()),
    );
    response.insert(
        "created_at".to_string(),
        serde_json::Value::Number(current_unix_timestamp().into()),
    );
    response.insert(
        "status".to_string(),
        serde_json::Value::String(status.to_string()),
    );
    response.insert(
        "model".to_string(),
        serde_json::Value::String(body.model.unwrap_or_else(default_model_name)),
    );
    response.insert("output".to_string(), serde_json::Value::Array(output));
    response.insert(
        "output_text".to_string(),
        serde_json::Value::String(output_text),
    );
    response.insert(
        "usage".to_string(),
        json!({
            "input_tokens": prompt_tokens,
            "input_tokens_details": {
                "cached_tokens": body
                    .usage
                    .as_ref()
                    .and_then(|usage| usage.cache_read_input_tokens)
                    .unwrap_or_default(),
            },
            "output_tokens": completion_tokens,
            "output_tokens_details": {
                // Anthropic does not report reasoning_tokens separately
                // (thinking tokens are included in output_tokens).
                "reasoning_tokens": 0,
            },
            "total_tokens": prompt_tokens.saturating_add(completion_tokens),
        }),
    );
    if let Some(incomplete_details) = incomplete_details {
        response.insert("incomplete_details".to_string(), incomplete_details);
    }

    let response_body = serde_json::to_vec(&serde_json::Value::Object(response))
        .map(Bytes::from)
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    Ok(TransformResponse {
        headers,
        path,
        body: response_body,
        conversion_trail: vec![ApiFormat::AnthropicMessages, ApiFormat::OpenaiResponses],
    })
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions response → Anthropic response
// ---------------------------------------------------------------------------

/// Transform an `OpenAI` Chat Completions response to an Anthropic Messages response.
///
/// Maps headers, path, and body for a non-streaming assistant message response.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the response body cannot be parsed
/// or if required response fields are missing.
pub fn openai_response_to_anthropic_message(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError> {
    let body: OpenAiResponseBody = parse_openai_response_body(&req.body)?;

    let mut headers = HashMap::new();
    if let Some(auth) = req.headers.get("authorization")
        && let Some(token) = auth.strip_prefix("Bearer ")
    {
        headers.insert("x-api-key".to_string(), token.to_string());
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    let path = "/v1/messages".to_string();

    let choice = body.choices.first().ok_or_else(|| {
        TransformError::MissingRequiredField("choices[0] in OpenAI response".to_string())
    })?;
    let message = choice.message.as_ref().ok_or_else(|| {
        TransformError::MissingRequiredField("choices[0].message in OpenAI response".to_string())
    })?;

    let mut content_blocks: Vec<serde_json::Value> = Vec::new();
    let reasoning_text =
        extract_text_from_openai_response_field(message.reasoning_content.as_ref());
    if !reasoning_text.is_empty() {
        content_blocks.push(json!({
            "type": "thinking",
            "thinking": reasoning_text,
            "signature": SYNTHETIC_THINKING_SIGNATURE,
        }));
    }

    let content_text = extract_text_from_openai_response_field(message.content.as_ref());
    if !content_text.is_empty() {
        content_blocks.push(json!({
            "type": "text",
            "text": content_text,
        }));
    }

    if let Some(tool_calls) = &message.tool_calls {
        for tool_call in tool_calls {
            let input = if tool_call.function.arguments.is_empty() {
                serde_json::Value::Object(serde_json::Map::new())
            } else {
                serde_json::from_str(&tool_call.function.arguments).map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "invalid tool_calls[].function.arguments JSON: {e}"
                    ))
                })?
            };

            content_blocks.push(json!({
                "type": "tool_use",
                "id": tool_call.id,
                "name": tool_call.function.name,
                "input": input,
            }));
        }
    }

    let prompt_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.prompt_tokens)
        .unwrap_or_default();
    let completion_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| usage.completion_tokens)
        .unwrap_or_default();
    let cache_read_input_tokens = body
        .usage
        .as_ref()
        .and_then(|usage| {
            usage
                .prompt_tokens_details
                .as_ref()
                .map(|d| d.cached_tokens)
        })
        .unwrap_or_default();
    // Note: reasoning_tokens is intentionally not propagated to
    // cache_creation_input_tokens — see comment at usage output below.

    let anthropic_response = json!({
        "id": body.id.as_deref().unwrap_or("msg-proxy"),
        "type": "message",
        "role": message.role.as_deref().unwrap_or("assistant"),
        "model": body.model.as_deref().unwrap_or("unknown"),
        "content": content_blocks,
        "stop_reason": map_openai_finish_reason_to_anthropic_stop_reason(
            choice.finish_reason.as_deref(),
        ),
        "stop_sequence": serde_json::Value::Null,
        "usage": {
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
            "cache_read_input_tokens": cache_read_input_tokens,
            // Anthropic `cache_creation_input_tokens` measures prompt-caching
            // write cost; it is not semantically equivalent to OpenAI's
            // `reasoning_tokens`. Set to 0 to avoid conflating the two.
            "cache_creation_input_tokens": 0,
        },
    });

    let body = serde_json::to_vec(&anthropic_response)
        .map(Bytes::from)
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    Ok(TransformResponse {
        headers,
        path,
        body,
        conversion_trail: vec![ApiFormat::OpenaiChat, ApiFormat::AnthropicMessages],
    })
}

// ---------------------------------------------------------------------------
// OpenAI Responses API response → Anthropic Messages response
// ---------------------------------------------------------------------------

/// `OpenAI` Responses API の非ストリーミングレスポンスを `Anthropic Messages` 形式に変換する。
///
/// upstream から返された Responses API レスポンスボディ（`output[]` 配列、`status`、
/// `usage` を含む）を解析し、Anthropic Messages レスポンス（`id`, `type`, `role`,
/// `content[]`, `stop_reason`, `usage`）にマッピングする。
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the response body cannot be parsed,
/// if required output item fields are missing, or if the response status is `"failed"`.
pub fn responses_response_to_anthropic(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError> {
    let body: ResponsesResponseBody = parse_responses_response_body(&req.body)?;

    // Step 1: ヘッダー変換 — authorization: Bearer → x-api-key
    let mut headers = HashMap::new();
    if let Some(auth) = req.headers.get("authorization")
        && let Some(token) = auth.strip_prefix("Bearer ")
    {
        headers.insert("x-api-key".to_string(), token.to_string());
    }
    headers.insert("content-type".to_string(), "application/json".to_string());

    // パスは Anthropic Messages API /v1/messages に設定
    let path = "/v1/messages".to_string();

    // status=failed は upstream エラーとして扱う
    if body.status.as_deref() == Some("failed") {
        return Err(TransformError::InvalidFormat(
            "Responses API response status is 'failed'".to_string(),
        ));
    }

    // Step 2: ID と model — 欠落時はデフォルト値
    let response_id = body.id.as_deref().unwrap_or("msg-proxy");
    let model = body.model.as_deref().unwrap_or("unknown");

    // Step 3: output[] → content[] マッピング
    let content_blocks = responses_output_to_content_blocks(&body.output)?;

    // Step 4: status → stop_reason マッピング
    let stop_reason = body
        .status
        .as_deref()
        .and_then(|status| {
            map_responses_status_to_anthropic_stop_reason(status, body.incomplete_details.as_ref())
        })
        .unwrap_or("end_turn");

    // Step 5: usage マッピング
    let input_tokens = body
        .usage
        .as_ref()
        .and_then(|u| u.input_tokens)
        .unwrap_or_default();
    let output_tokens = body
        .usage
        .as_ref()
        .and_then(|u| u.output_tokens)
        .unwrap_or_default();
    let cache_read = body
        .usage
        .as_ref()
        .and_then(|u| u.input_tokens_details.as_ref())
        .map(|d| d.cached_tokens)
        .unwrap_or_default();

    // Step 6: Anthropic レスポンス JSON 構築
    // openai_response_to_anthropic_message() と同一構造
    let anthropic_response = json!({
        "id": response_id,
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": content_blocks,
        "stop_reason": stop_reason,
        "stop_sequence": serde_json::Value::Null,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_input_tokens": cache_read,
            // Anthropic `cache_creation_input_tokens` は `reasoning_tokens` と
            // 意味的に異なるため常に 0 に設定
            "cache_creation_input_tokens": 0,
        },
    });

    let response_body = serde_json::to_vec(&anthropic_response)
        .map(Bytes::from)
        .map_err(|e| TransformError::InvalidFormat(format!("response serialization: {e}")))?;

    // Step 7: 変換経路記録
    Ok(TransformResponse {
        headers,
        path,
        body: response_body,
        conversion_trail: vec![ApiFormat::OpenaiResponses, ApiFormat::AnthropicMessages],
    })
}

/// Responses API の `output[]` 配列を Anthropic Messages の `content[]` ブロックに変換する。
///
/// 各 output item の `type` フィールドに応じて以下のルールでマッピングする：
///
/// | Responses item type | Anthropic content block |
/// |---|---|
/// | `message` | `type: "text"` ブロック（content 内の output_text を抽出） |
/// | `reasoning` | `type: "thinking"` ブロック（summary からテキスト抽出） |
/// | `function_call` | `type: "tool_use"` ブロック |
/// | `function_call_output` | スキップ（tool_result はレスポンスに含まれない） |
/// | その他 | スキップ（`tracing::debug` で lossy downgrade を記録） |
fn responses_output_to_content_blocks(
    output: &[serde_json::Value],
) -> Result<Vec<serde_json::Value>, TransformError> {
    let mut content_blocks: Vec<serde_json::Value> = Vec::new();

    for item in output {
        let item_type = item
            .get("type")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");

        match item_type {
            "message" => {
                // message item → text block
                let content = responses_content_to_text(item.get("content"));
                if !content.is_empty() {
                    content_blocks.push(json!({
                        "type": "text",
                        "text": content,
                    }));
                }
            }
            "reasoning" => {
                // reasoning item → thinking block
                let thinking = responses_content_to_text(item.get("summary"));
                if !thinking.is_empty() {
                    content_blocks.push(json!({
                        "type": "thinking",
                        "thinking": thinking,
                        "signature": SYNTHETIC_THINKING_SIGNATURE,
                    }));
                }
            }
            "function_call" => {
                // function_call item → tool_use block
                let call_id = item.get("call_id").and_then(serde_json::Value::as_str).ok_or_else(|| {
                    TransformError::MissingRequiredField(
                        "function_call.call_id in Responses output".to_string(),
                    )
                })?;
                let name = item.get("name").and_then(serde_json::Value::as_str).ok_or_else(|| {
                    TransformError::MissingRequiredField(
                        "function_call.name in Responses output".to_string(),
                    )
                })?;
                let arguments_str = item
                    .get("arguments")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");

                // arguments（JSON 文字列）→ tool_use.input（JSON オブジェクト）
                let input = if arguments_str.is_empty() {
                    serde_json::Value::Object(serde_json::Map::new())
                } else {
                    serde_json::from_str(arguments_str).unwrap_or_else(|_| {
                        tracing::debug!(
                            "failed to parse function_call.arguments as JSON, \
                             falling back to empty object"
                        );
                        serde_json::Value::Object(serde_json::Map::new())
                    })
                };

                content_blocks.push(json!({
                    "type": "tool_use",
                    "id": call_id,
                    "name": name,
                    "input": input,
                }));
            }
            "function_call_output" => {
                // function_call_output はリクエスト側の入力（tool_result）であり、
                // レスポンスの content には含めない
                tracing::debug!(
                    "skipping Responses output item type: function_call_output"
                );
            }
            item_type => {
                // 未知の item type（computer_call, browser_call 等）は
                // lossy downgrade としてスキップ
                tracing::debug!(
                    "skipping unsupported Responses output item type: '{}'",
                    item_type
                );
            }
        }
    }

    Ok(content_blocks)
}

/// Responses API `status` と `incomplete_details` を Anthropic `stop_reason` にマッピングする。
///
/// | Responses status | Anthropic stop_reason |
/// |---|---|
/// | `"completed"` | `"end_turn"` |
/// | `"incomplete"` + `reason=max_output_tokens` | `"max_tokens"` |
/// | `"incomplete"` + `reason=content_filter` | `"content_filter"` |
/// | `"incomplete"` + その他の reason | `"max_tokens"`（安全側） |
/// | `"failed"` | `None`（呼び出し元でエラー処理済み） |
/// | 未知の status | `"end_turn"` |
fn map_responses_status_to_anthropic_stop_reason(
    status: &str,
    incomplete_details: Option<&serde_json::Value>,
) -> Option<&'static str> {
    match status {
        "incomplete" => {
            let reason = incomplete_details
                .and_then(|d| d.get("reason"))
                .and_then(serde_json::Value::as_str);
            match reason {
                Some("content_filter") => Some("content_filter"),
                // "max_output_tokens" および全ての未知の理由は安全側に倒す
                _ => Some("max_tokens"),
            }
        }
        // "failed" は呼び出し元の responses_response_to_anthropic() で
        // 事前にエラーとして処理済みのため到達しない
        "failed" => None,
        // "completed" および未知の status は end_turn
        _ => Some("end_turn"),
    }
}

// ---------------------------------------------------------------------------
// Internal helpers used by multiple response transforms
// ---------------------------------------------------------------------------

pub(crate) fn extract_openai_message_fields_from_anthropic_content(
    content: &[serde_json::Value],
) -> Result<(String, String, Vec<serde_json::Value>), TransformError> {
    let mut reasoning_content = String::new();
    let mut content_text = String::new();
    let mut tool_calls = Vec::new();

    for block in content {
        let block_type = block
            .get("type")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                TransformError::MissingRequiredField("content block 'type'".to_string())
            })?;

        match block_type {
            "thinking" => {
                let thinking = block
                    .get("thinking")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField(
                            "thinking block 'thinking' field".to_string(),
                        )
                    })?;
                append_text_fragment(&mut reasoning_content, thinking);
            }
            "text" => {
                let text = block
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField("text block 'text' field".to_string())
                    })?;
                append_text_fragment(&mut content_text, text);
            }
            "tool_use" => {
                let id = block
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField(
                            "tool_use block 'id' field".to_string(),
                        )
                    })?;
                let name = block
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
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
                            TransformError::InvalidFormat(format!(
                                "tool_use input serialization: {e}"
                            ))
                        })?,
                    },
                }));
            }
            "image" | "tool_result" | "redacted_thinking" => {
                tracing::debug!(
                    "lossy downgrade: skipping unsupported Anthropic response content block type \
                     '{}'",
                    block_type
                );
            }
            other => {
                tracing::debug!(
                    "lossy downgrade: skipping unknown Anthropic response content block type '{}'",
                    other
                );
            }
        }
    }

    Ok((reasoning_content, content_text, tool_calls))
}

pub(crate) fn append_text_fragment(target: &mut String, fragment: &str) {
    if fragment.is_empty() {
        return;
    }

    if !target.is_empty() {
        target.push('\n');
    }
    target.push_str(fragment);
}

pub(crate) fn extract_text_from_content(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(blocks) => {
            let mut text_parts = Vec::new();
            for block in blocks {
                if let Some(block_type) = block.get("type").and_then(|v| v.as_str())
                    && block_type == "text"
                    && let Some(text) = block.get("text").and_then(|v| v.as_str())
                {
                    text_parts.push(text);
                }
            }
            text_parts.join(" ")
        }
        _ => String::new(),
    }
}

fn extract_text_from_openai_response_field(content: Option<&serde_json::Value>) -> String {
    match content {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(values)) => values
            .iter()
            .filter_map(|value| match value {
                serde_json::Value::String(s) => Some(s.clone()),
                serde_json::Value::Object(map) => map
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

pub(crate) fn map_openai_finish_reason_to_anthropic_stop_reason(
    finish_reason: Option<&str>,
) -> Option<&'static str> {
    finish_reason
        .and_then(super::stop_reason::openai_to_canonical)
        .map(super::stop_reason::canonical_to_anthropic)
}

pub(crate) fn map_anthropic_stop_reason_to_openai_finish_reason(
    stop_reason: Option<&str>,
    stop_sequence: Option<&str>,
) -> Option<&'static str> {
    if let Some(reason) = stop_reason.and_then(super::stop_reason::anthropic_to_canonical) {
        return Some(super::stop_reason::canonical_to_openai(reason));
    }
    // Fallback: if stop_sequence was provided but no explicit stop_reason, return "stop"
    if stop_sequence.is_some() {
        return Some("stop");
    }
    None
}

pub(crate) fn openai_tool_to_anthropic_tool(
    tool: &super::openai_to_anthropic::OpenAiRequestTool,
) -> Result<serde_json::Value, TransformError> {
    let function = tool.function.as_ref().ok_or_else(|| {
        TransformError::MissingRequiredField("tools[].function in OpenAI request".to_string())
    })?;

    let mut anthropic_tool = serde_json::Map::new();
    anthropic_tool.insert(
        "name".to_string(),
        serde_json::Value::String(function.name.clone()),
    );
    if let Some(description) = &function.description {
        anthropic_tool.insert(
            "description".to_string(),
            serde_json::Value::String(description.clone()),
        );
    }
    if let Some(parameters) = &function.parameters {
        anthropic_tool.insert("input_schema".to_string(), parameters.clone());
    }

    Ok(serde_json::Value::Object(anthropic_tool))
}

pub(crate) fn openai_tool_choice_to_anthropic(
    tool_choice: &serde_json::Value,
) -> Result<serde_json::Value, TransformError> {
    match tool_choice {
        serde_json::Value::String(choice) => match choice.as_str() {
            "auto" => Ok(json!({ "type": "auto" })),
            "required" => Ok(json!({ "type": "any" })),
            "none" => Ok(json!({ "type": "none" })),
            other => Err(TransformError::InvalidFormat(format!(
                "unsupported OpenAI tool_choice string: {other}"
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
                        .get("function")
                        .and_then(|function| function.get("name"))
                        .and_then(serde_json::Value::as_str)
                        .or_else(|| map.get("name").and_then(serde_json::Value::as_str))
                        .ok_or_else(|| {
                            TransformError::MissingRequiredField(
                                "tool_choice.function.name in OpenAI request".to_string(),
                            )
                        })?;
                    Ok(json!({ "type": "tool", "name": name }))
                }
                "auto" => Ok(json!({ "type": "auto" })),
                "required" => Ok(json!({ "type": "any" })),
                "none" => Ok(json!({ "type": "none" })),
                other => Err(TransformError::InvalidFormat(format!(
                    "unsupported OpenAI tool_choice object type: {other}"
                ))),
            }
        }
        other => Err(TransformError::InvalidFormat(format!(
            "unsupported OpenAI tool_choice type: {other:?}"
        ))),
    }
}

fn anthropic_content_to_responses_output(
    content: &[serde_json::Value],
    response_id: &str,
) -> Result<(Vec<serde_json::Value>, String), TransformError> {
    let mut output = Vec::new();
    let mut output_text = Vec::new();

    for (index, block) in content.iter().enumerate() {
        let block_type = block
            .get("type")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                TransformError::MissingRequiredField("content block 'type'".to_string())
            })?;

        match block_type {
            "thinking" => {
                let thinking = block
                    .get("thinking")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField(
                            "thinking block 'thinking' field".to_string(),
                        )
                    })?;
                output.push(build_responses_message_output_item(
                    &format!("{response_id}_msg_{index}"),
                    &json!({ "type": "reasoning_text", "text": thinking }),
                ));
            }
            "text" => {
                let text = block
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField("text block 'text' field".to_string())
                    })?;
                output_text.push(text.to_string());
                output.push(build_responses_message_output_item(
                    &format!("{response_id}_msg_{index}"),
                    &json!({ "type": "output_text", "text": text, "annotations": [] }),
                ));
            }
            "tool_use" => {
                let call_id = block
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField(
                            "tool_use block 'id' field".to_string(),
                        )
                    })?;
                let name = block
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        TransformError::MissingRequiredField(
                            "tool_use block 'name' field".to_string(),
                        )
                    })?;
                let arguments = serde_json::to_string(
                    &block
                        .get("input")
                        .cloned()
                        .unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
                )
                .map_err(|e| {
                    TransformError::InvalidFormat(format!(
                        "tool_use input serialization failed: {e}"
                    ))
                })?;
                output.push(build_responses_function_call_item(
                    &format!("fc_{response_id}_{index}"),
                    call_id,
                    name,
                    &arguments,
                    "completed",
                ));
            }
            "image" | "tool_result" | "redacted_thinking" => {
                tracing::debug!(
                    "lossy downgrade: skipping unsupported Anthropic response content block type \
                     '{}'",
                    block_type
                );
            }
            other => {
                tracing::debug!(
                    "lossy downgrade: skipping unknown Anthropic response content block type '{}'",
                    other
                );
            }
        }
    }

    Ok((output, output_text.join("\n")))
}

pub(crate) fn build_responses_message_output_item(
    item_id: &str,
    part: &serde_json::Value,
) -> serde_json::Value {
    json!({
        "id": item_id,
        "type": "message",
        "role": "assistant",
        "status": "completed",
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

pub(crate) fn anthropic_stop_reason_to_responses_status(
    stop_reason: Option<&str>,
) -> (&'static str, Option<serde_json::Value>) {
    match stop_reason {
        Some("max_tokens") => (
            "incomplete",
            Some(json!({
                "reason": "max_output_tokens",
            })),
        ),
        Some("content_filter") => (
            "incomplete",
            Some(json!({
                "reason": "content_filter",
            })),
        ),
        _ => ("completed", None),
    }
}

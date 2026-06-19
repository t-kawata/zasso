//! OpenAI / Anthropic 互換エンドポイントハンドラ
//!
//! 3つのハンドラ関数を提供する：
//!
//! - `openai_chat_handler` — `POST /v1/chat/completions`
//! - `list_models_handler` — `GET /v1/models`
//! - `anthropic_messages_handler` — `POST /anthropic/v1/messages`
//!
//! 全ハンドラは `AppState`（`Arc<dyn InferenceEngine>`）を共有状態として受け取り、
//! 実際の推論は `InferenceEngine` トレイトのメソッドに委譲する。

use std::collections::HashMap;

use axum::extract::State;
use axum::Json;
use serde_json::Value;

use mistralrs::{ChatCompletionResponse, RequestBuilder, Response, TextMessageRole, TextMessages};

use super::router::{AppError, AppState};
use crate::error::GgufError;

/// レスポンス本文から messages 配列をパースして TextMessages を構築する
///
/// OpenAI 互換形式のリクエストボディから `messages` 配列を抽出し、
/// mistralrs の TextMessages に変換する。role/content の組を順次追加する。
fn parse_messages(body: &Value) -> TextMessages {
    let mut text_messages = TextMessages::new();
    if let Some(messages) = body["messages"].as_array() {
        for msg in messages {
            let role = match msg["role"].as_str() {
                Some("user") => TextMessageRole::User,
                Some("assistant") => TextMessageRole::Assistant,
                Some("system") => TextMessageRole::System,
                Some("tool") => TextMessageRole::Tool,
                _ => continue,
            };
            let content = msg["content"].as_str().unwrap_or("");
            text_messages = text_messages.add_message(role, content);
        }
    }
    text_messages
}

/// mistralrs の Response から ChatCompletionResponse を抽出する
///
/// Response 列挙型のバリアントに応じて、成功時は ChatCompletionResponse を、
/// エラー時は AppError を返す。
fn extract_chat_response(response: Response) -> Result<ChatCompletionResponse, AppError> {
    match response {
        Response::Done(chat_response) => Ok(chat_response),
        Response::ModelError(msg, _) => Err(GgufError::InferenceFailed(Box::new(
            std::io::Error::new(std::io::ErrorKind::Other, msg),
        ))
        .into()),
        Response::InternalError(e) => Err(GgufError::InferenceFailed(e).into()),
        Response::ValidationError(e) => Err(GgufError::InvalidConfig(e.to_string()).into()),
        _ => Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            "unexpected response type from mistralrs",
        )))
        .into()),
    }
}

/// POST /v1/chat/completions — OpenAI 互換チャット補完
///
/// リクエストボディから model 名と messages 配列を抽出し、
/// mistralrs の推論エンジンに委譲する。
pub async fn openai_chat_handler(
    State(engine): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<ChatCompletionResponse>, AppError> {
    let model_name = body["model"].as_str().unwrap_or("qwen3.5-0.8b");

    let text_messages = parse_messages(&body);
    let request_builder = RequestBuilder::from(text_messages);
    let response = engine.send_raw(model_name, request_builder).await?;
    let chat_response = extract_chat_response(response)?;

    Ok(Json(chat_response))
}

/// GET /v1/models — OpenAI 互換モデル一覧
///
/// 現時点ではビルトインモデルの固定一覧を返す。
/// M4-2 以降で InferenceEngine から動的に取得する形に拡張可能。
pub async fn list_models_handler(State(_engine): State<AppState>) -> Json<Value> {
    Json(serde_json::json!({
        "object": "list",
        "data": [
            {"id": "qwen3.5-0.8b", "object": "model"},
            {"id": "qwen3.5-2b", "object": "model"},
        ],
    }))
}

/// POST /anthropic/v1/messages — Anthropic 互換 Messages API
///
/// mistralrs は Anthropic 互換型を提供しないため、
/// llm-bridge-core の transform 関数を用いてリクエスト・レスポンスを
/// 双方向変換する。
///
/// 処理の流れ:
/// 1. Anthropic リクエスト → `anthropic_to_openai()` で OpenAI 形式に変換
/// 2. OpenAI 形式から model + messages を抽出し、`send_raw()` に委譲
/// 3. mistralrs の OpenAI 互換レスポンス → `openai_response_to_anthropic_message()` で逆変換
pub async fn anthropic_messages_handler(
    State(engine): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    // ----------------------------------------------------------------
    // Step 1: Anthropic リクエストを OpenAI 形式に変換
    // ----------------------------------------------------------------
    let body_bytes = serde_json::to_vec(&body)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    let transform_req = llm_bridge_core::model::TransformRequest {
        headers: HashMap::new(),
        path: "/anthropic/v1/messages".into(),
        body: body_bytes.into(),
    };

    let openai_req = llm_bridge_core::transform::anthropic_to_openai(&transform_req)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    // ----------------------------------------------------------------
    // Step 2: OpenAI 形式から model + messages を抽出し、推論実行
    // ----------------------------------------------------------------
    let openai_body: Value = serde_json::from_slice(&openai_req.body)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    let model_name = openai_body["model"].as_str().unwrap_or("qwen3.5-0.8b");

    let text_messages = parse_messages(&openai_body);
    let request_builder = RequestBuilder::from(text_messages);
    let response = engine.send_raw(model_name, request_builder).await?;
    let chat_response = extract_chat_response(response)?;

    // ----------------------------------------------------------------
    // Step 3: OpenAI レスポンスを Anthropic 形式に逆変換
    // ----------------------------------------------------------------
    let openai_resp_bytes = serde_json::to_vec(&chat_response)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    let anthropic_resp_req = llm_bridge_core::model::TransformRequest {
        headers: HashMap::new(),
        path: "/v1/chat/completions".into(),
        body: openai_resp_bytes.into(),
    };

    let anthropic_resp =
        llm_bridge_core::transform::openai_response_to_anthropic_message(&anthropic_resp_req)
            .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    let anthropic_body: Value = serde_json::from_slice(&anthropic_resp.body)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    Ok(Json(anthropic_body))
}

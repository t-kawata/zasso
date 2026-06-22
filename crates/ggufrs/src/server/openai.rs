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

use axum::extract::State;
use axum::Json;
use serde_json::Value;

// [::STUB::] M6-9/M6-11: 全 mistralrs 依存が仮置きにより未使用。M6-9 で自前型に置き換え、M6-11 で削除。
#[allow(unused_imports)]
use mistralrs::{ChatCompletionResponse, RequestBuilder, Response, TextMessageRole, TextMessages};

use super::router::{AppError, AppState};
use crate::error::GgufError;

/// レスポンス本文から messages 配列をパースして TextMessages を構築する
///
/// OpenAI 互換形式のリクエストボディから `messages` 配列を抽出し、
/// mistralrs の TextMessages に変換する。role/content の組を順次追加する。
/// [::STUB::] M6-9: ハンドラ仮置きにより未使用。M6-9 で削除または自前型版に改修。
#[allow(dead_code)]
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
/// [::STUB::] M6-9: ハンドラ仮置きにより未使用。M6-9 で削除または自前型版に改修。
#[allow(dead_code)]
fn extract_chat_response(response: Response) -> Result<ChatCompletionResponse, AppError> {
    match response {
        Response::Done(chat_response) => Ok(chat_response),
        Response::ModelError(msg, _) => {
            Err(GgufError::InferenceFailed(Box::new(std::io::Error::other(msg))).into())
        }
        Response::InternalError(e) => Err(GgufError::InferenceFailed(e).into()),
        Response::ValidationError(e) => Err(GgufError::InvalidConfig(e.to_string()).into()),
        _ => Err(GgufError::InferenceFailed(Box::new(std::io::Error::other(
            "unexpected response type from mistralrs",
        )))
        .into()),
    }
}

/// POST /v1/chat/completions — OpenAI 互換チャット補完
///
/// リクエストボディから model 名と messages 配列を抽出し、
/// llama-cpp-2 の推論エンジンに委譲する。
///
/// [::STUB::] M6-9: send_raw が InferenceEngine トレイトから削除されたため仮置き。
/// M6-9 で generate/generate_stream を使用した実装に置き換える。
pub async fn openai_chat_handler(
    State(_engine): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<ChatCompletionResponse>, AppError> {
    Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "openai_chat_handler pending M6-9",
    )))
    .into())
}

/// GET /v1/models — OpenAI 互換モデル一覧
///
/// 現時点ではビルトインモデルの固定一覧を返す。
/// M4-2 以降で InferenceEngine から動的に取得する形に拡張可能。
pub async fn list_models_handler(State(_engine): State<AppState>) -> Json<Value> {
    Json(serde_json::json!({
        "object": "list",
        "data": [
            {"id": "gemma4-e2b", "object": "model"},
            {"id": "gemma4-e4b", "object": "model"},
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
/// [::STUB::] M6-9: send_raw が InferenceEngine トレイトから削除されたため仮置き。
/// M6-9 で Anthropic ハンドラ自体を削除予定。
pub async fn anthropic_messages_handler(
    State(_engine): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "anthropic_messages_handler pending M6-9 (to be deleted)",
    )))
    .into())
}

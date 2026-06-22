//! OpenAI 互換エンドポイントハンドラ
//!
//! 2つのハンドラ関数を提供する：
//!
//! - `chat_completions_handler` — `POST /v1/chat/completions`
//! - `list_models_handler` — `GET /v1/models`
//!
//! 全ハンドラは `AppState`（`Arc<dyn InferenceEngine>`）を共有状態として受け取り、
//! 実際の推論は `InferenceEngine` トレイトのメソッドに委譲する。

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures::StreamExt;
use serde_json::Value;

use super::router::{AppError, AppState};
use super::types::{
    ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse, ChatResponseMessage,
    ChunkChoice, Choice, Delta,
};
use crate::inference::GenerateParams;

/// POST /v1/chat/completions — OpenAI 互換チャット補完
///
/// リクエストボディの `stream` フィールドにより、非ストリーミング（一括 JSON レスポンス）
/// とストリーミング（SSE 形式）を分岐する。
///
/// # 引数
/// - `engine`: InferenceEngine トレイトの共有状態
/// - `req`: 自前定義の ChatCompletionRequest（JSON デシリアライズ）
pub async fn chat_completions_handler(
    State(engine): State<AppState>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Response, AppError> {
    if req.stream.unwrap_or(false) {
        stream_chat_completions(engine, req).await
    } else {
        let response = chat_completions_sync(engine, req).await?;
        Ok(Json(response).into_response())
    }
}

/// 非ストリーミングチャット補完 — 一括 JSON レスポンスを返す
///
/// ChatCompletionRequest を受け取り、InferenceEngine::generate() を呼び出して
/// 生成テキストを ChatCompletionResponse にラップして返す。
async fn chat_completions_sync(
    engine: AppState,
    req: ChatCompletionRequest,
) -> Result<ChatCompletionResponse, AppError> {
    let model_name = req.model.as_deref().unwrap_or("default");
    let prompt = build_prompt_from_messages(&req.messages);
    let params = params_from_request(&req);

    let text = engine.generate(model_name, &prompt, params).await?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    Ok(ChatCompletionResponse {
        id: format!("chatcmpl-{now}"),
        object: "chat.completion".into(),
        created: now,
        model: model_name.to_string(),
        choices: vec![Choice {
            index: 0,
            message: ChatResponseMessage {
                role: "assistant".into(),
                content: text,
            },
            finish_reason: "stop".into(),
        }],
        usage: None,
    })
}

/// ストリーミングチャット補完 — SSE 形式で逐次出力する
///
/// InferenceEngine::generate_stream() から取得したストリームを
/// SSE（Server-Sent Events）形式で Axum の Response<Body> に変換する。
/// 各トークンは ChatCompletionChunk としてエンコードされる。
async fn stream_chat_completions(
    engine: AppState,
    req: ChatCompletionRequest,
) -> Result<Response, AppError> {
    let model_name = req.model.as_deref().unwrap_or("default");
    let prompt = build_prompt_from_messages(&req.messages);
    let params = params_from_request(&req);

    let stream = engine.generate_stream(model_name, &prompt, params).await?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let chat_id = format!("chatcmpl-{now}");
    let model = model_name.to_string();

    // 各トークンを SSE チャンクに変換する
    let sse_stream = stream.map({
        let chat_id = chat_id.clone();
        let model = model.clone();
        move |token_result| -> Result<String, std::convert::Infallible> {
            match token_result {
                Ok(token) => {
                    let chunk = ChatCompletionChunk {
                        id: chat_id.clone(),
                        object: "chat.completion.chunk".into(),
                        created: now,
                        model: model.clone(),
                        choices: vec![ChunkChoice {
                            index: 0,
                            delta: Delta {
                                role: None,
                                content: Some(token),
                            },
                            finish_reason: None,
                        }],
                    };
                    Ok(serde_json::to_string(&chunk).unwrap_or_default())
                }
                Err(_e) => {
                    // エラーの場合も SSE 経由でエラーチャンクを送信する
                    let error_chunk = serde_json::json!({
                        "error": "inference error"
                    });
                    Ok(serde_json::to_string(&error_chunk).unwrap_or_default())
                }
            }
        }
    });

    let body = axum::body::Body::from_stream(sse_stream);
    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .body(body)
        .unwrap();

    Ok(response)
}

/// ChatMessage の配列から推論用のプレーンテキストプロンプトを構築する
///
/// OpenAI 互換の messages 形式を、llama-cpp-2 のテキスト生成に適した
/// 単一文字列に変換する。role と content を交互に並べる。
fn build_prompt_from_messages(messages: &[super::types::ChatMessage]) -> String {
    messages
        .iter()
        .map(|msg| format!("{}: {}", msg.role, msg.content))
        .collect::<Vec<_>>()
        .join("\n")
}

/// ChatCompletionRequest から GenerateParams を構築する
///
/// リクエストの各オプションフィールドをそのまま GenerateParams にマッピングする。
fn params_from_request(req: &ChatCompletionRequest) -> GenerateParams {
    GenerateParams {
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        top_p: req.top_p,
        presence_penalty: req.presence_penalty,
        frequency_penalty: req.frequency_penalty,
    }
}

/// GET /v1/models — OpenAI 互換モデル一覧
///
/// ビルトインモデルの固定一覧を返す。
/// 将来 InferenceEngine から動的に取得する形に拡張可能。
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

#[cfg(test)]
mod tests {
    use super::*;

    /// build_prompt_from_messages が単一メッセージを正しく変換する
    #[test]
    fn build_prompt_joins_single_message() {
        let messages = vec![super::super::types::ChatMessage {
            role: "user".into(),
            content: "Hello".into(),
        }];
        let prompt = build_prompt_from_messages(&messages);
        assert_eq!(prompt, "user: Hello");
    }

    /// build_prompt_from_messages が複数メッセージを \n 結合する
    #[test]
    fn build_prompt_joins_multiple_messages() {
        let messages = vec![
            super::super::types::ChatMessage {
                role: "system".into(),
                content: "Be helpful.".into(),
            },
            super::super::types::ChatMessage {
                role: "user".into(),
                content: "Tell me a story.".into(),
            },
        ];
        let prompt = build_prompt_from_messages(&messages);
        assert_eq!(prompt, "system: Be helpful.\nuser: Tell me a story.");
    }

    /// build_prompt_from_messages が空配列で空文字列を返す
    #[test]
    fn build_prompt_handles_empty_messages() {
        let messages = vec![];
        let prompt = build_prompt_from_messages(&messages);
        assert_eq!(prompt, "");
    }
}

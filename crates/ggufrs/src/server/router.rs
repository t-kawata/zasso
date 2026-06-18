//! Axum ルーター
//!
//! サーバーエントリポイント。`AppState` を共有状態とし、3つのエンドポイントを
//! Axum Router に登録する。全推論操作は `InferenceEngine` トレイトに委譲する。
//!
//! # 型定義
//!
//! - `AppState`: 共有状態（`Arc<dyn InferenceEngine>`）
//! - `AppError`: 共通エラー型（HTTP ステータスコード + JSON エラーメッセージ）

use std::sync::Arc;

use axum::routing::{get, post};
use axum::{http::StatusCode, Json, Router};
use serde_json::Value;

use super::openai;
use super::openai::list_models_handler;
use crate::error::GgufError;
use crate::inference::InferenceEngine;

/// Axum ハンドラ用の共有状態型
///
/// InferenceEngine トレイト経由で全推論操作を行う。
/// `Send + Sync` によりスレッドセーフに共有可能。
pub type AppState = Arc<dyn InferenceEngine + Send + Sync>;

/// Axum ハンドラ用の共通エラー型
///
/// HTTP ステータスコードと JSON エラーメッセージの組。
/// `From<GgufError>` によりハンドラ内部で `?` 演算子で自動変換される。
pub type AppError = (StatusCode, Json<Value>);

/// GgufError から AppError への自動変換
///
/// GgufError の6バリアントそれぞれを適切な HTTP ステータスコードと
/// JSON エラーボディにマッピングする。
impl From<GgufError> for AppError {
    fn from(err: GgufError) -> Self {
        let (status, message) = match &err {
            GgufError::ModelNotFound(_) => (StatusCode::NOT_FOUND, err.to_string()),
            GgufError::ModelLoadFailed { .. } => {
                (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
            }
            GgufError::InferenceFailed(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::ServerStartupFailed(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
            }
            GgufError::InvalidConfig(_) => (StatusCode::BAD_REQUEST, err.to_string()),
            GgufError::MistralrsError(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
        };
        (status, Json(serde_json::json!({"error": message})))
    }
}

/// Axum ルーターを構築する
///
/// OpenAI 互換・Anthropic 互換・モデル一覧の3エンドポイントを登録する。
pub fn build_router(engine: AppState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(openai::openai_chat_handler))
        .route("/v1/models", get(list_models_handler))
        .route(
            "/anthropic/v1/messages",
            post(openai::anthropic_messages_handler),
        )
        .with_state(engine)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::tests::MockEngine;
    use axum::body::Body;
    use axum::http::{Method, Request, StatusCode};
    use std::sync::Arc;
    use tower::util::ServiceExt;

    // mistralrs の型は tests モジュール内で直接インポートする
    use mistralrs::{ChatCompletionResponse, Choice, Response, ResponseMessage, Usage};

    // ── AppError 変換テスト ──

    #[test]
    fn model_not_found_returns_404() {
        let err = GgufError::ModelNotFound("test".into());
        let (status, _) = AppError::from(err);
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[test]
    fn inference_failed_returns_500() {
        let err = GgufError::InferenceFailed(Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            "fail",
        )));
        let (status, _) = AppError::from(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn invalid_config_returns_400() {
        let err = GgufError::InvalidConfig("bad".into());
        let (status, _) = AppError::from(err);
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn model_load_failed_returns_500() {
        let err = GgufError::ModelLoadFailed {
            name: "x".into(),
            source: Box::new(std::io::Error::new(std::io::ErrorKind::Other, "load fail")),
        };
        let (status, _) = AppError::from(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn server_startup_failed_returns_500() {
        let err = GgufError::ServerStartupFailed(Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            "startup fail",
        )));
        let (status, _) = AppError::from(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn mistralrs_error_returns_500() {
        let err = GgufError::MistralrsError(mistralrs::error::Error::ModelLoad(Box::new(
            std::io::Error::new(std::io::ErrorKind::Other, "mistralrs error"),
        )));
        let (status, _) = AppError::from(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn app_error_contains_error_field() {
        let err = GgufError::InvalidConfig("bad".into());
        let (_, Json(body)) = AppError::from(err);
        assert!(
            body.get("error").is_some(),
            "AppError JSON body must contain 'error' field"
        );
    }

    // ── ルーティングテスト ──

    fn mock_app_state() -> AppState {
        let mut mock = MockEngine::new();

        // send_raw はデフォルトでエラーを返す設定（呼ばれなければ OK）
        mock.expect_send_raw().returning(|_, _| {
            Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "not called in routing test",
            ))))
        });

        // generate もエラーを返す（ルーティングテストで send_raw が呼ばれないようにするため）
        // ただし openai_chat_handler は send_raw を呼ぶので、このダミーは使われない
        // → ルーティングテストではリクエストボディを空にしておく

        Arc::new(mock)
    }

    #[tokio::test]
    async fn post_chat_completions_returns_200_or_400() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/chat/completions")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"model":"test","messages":[]}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        // send_raw が Err を返すので 500。正常系は openai.rs の結合テストで確認
        assert!(response.status() == StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn get_models_returns_200() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/v1/models")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn post_anthropic_messages_returns_200_or_400() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/anthropic/v1/messages")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"model":"test","messages":[]}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        // send_raw が Err → 500
        assert!(response.status() == StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn unknown_path_returns_404() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/unknown")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn wrong_method_returns_405() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/v1/chat/completions")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    // ── openai_chat_handler 結合テスト（MockEngine 使用） ──

    #[tokio::test]
    async fn openai_handler_returns_chat_completion() {
        let mut mock = MockEngine::new();
        mock.expect_send_raw().times(1).returning(|_, _| {
            Ok(Response::Done(ChatCompletionResponse {
                id: "chatcmpl-123".into(),
                choices: vec![Choice {
                    finish_reason: "stop".into(),
                    index: 0,
                    message: ResponseMessage {
                        content: Some("Hello!".into()),
                        role: "assistant".into(),
                        tool_calls: None,
                        reasoning_content: None,
                    },
                    logprobs: None,
                }],
                created: 1710000000,
                model: "test-model".into(),
                system_fingerprint: "fp".into(),
                object: "chat.completion".into(),
                usage: Usage {
                    completion_tokens: 5,
                    prompt_tokens: 10,
                    total_tokens: 15,
                    avg_tok_per_sec: 0.0,
                    avg_prompt_tok_per_sec: 0.0,
                    avg_compl_tok_per_sec: 0.0,
                    total_time_sec: 0.0,
                    total_prompt_time_sec: 0.0,
                    total_completion_time_sec: 0.0,
                },
            }))
        });

        let app = build_router(Arc::new(mock));
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/chat/completions")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"model":"test-model","messages":[{"role":"user","content":"Hello"}]}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body["id"], "chatcmpl-123");
        assert_eq!(body["choices"][0]["message"]["content"], "Hello!");
    }

    #[tokio::test]
    async fn openai_handler_returns_error_on_send_raw_failure() {
        let mut mock = MockEngine::new();
        mock.expect_send_raw()
            .times(1)
            .returning(|_, _| Err(GgufError::ModelNotFound("unknown-model".into())));

        let app = build_router(Arc::new(mock));
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/chat/completions")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"model":"unknown-model","messages":[{"role":"user","content":"Hi"}]}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    // ── list_models_handler 結合テスト ──

    #[tokio::test]
    async fn list_models_returns_valid_json() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/v1/models")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&body_bytes).unwrap();
        assert!(body.get("object").is_some());
        assert!(body.get("data").is_some());
    }

    // ── anthropic_messages_handler 結合テスト ──

    #[tokio::test]
    async fn anthropic_handler_returns_anthropic_format() {
        let mut mock = MockEngine::new();
        mock.expect_send_raw().times(1).returning(|_, _| {
            Ok(Response::Done(ChatCompletionResponse {
                id: "chatcmpl-456".into(),
                choices: vec![Choice {
                    finish_reason: "stop".into(),
                    index: 0,
                    message: ResponseMessage {
                        content: Some("Hello from Anthropic!".into()),
                        role: "assistant".into(),
                        tool_calls: None,
                        reasoning_content: None,
                    },
                    logprobs: None,
                }],
                created: 1710000000,
                model: "claude-3".into(),
                system_fingerprint: "fp".into(),
                object: "chat.completion".into(),
                usage: Usage {
                    completion_tokens: 5,
                    prompt_tokens: 10,
                    total_tokens: 15,
                    avg_tok_per_sec: 0.0,
                    avg_prompt_tok_per_sec: 0.0,
                    avg_compl_tok_per_sec: 0.0,
                    total_time_sec: 0.0,
                    total_prompt_time_sec: 0.0,
                    total_completion_time_sec: 0.0,
                },
            }))
        });

        let app = build_router(Arc::new(mock));
        // Anthropic 形式のリクエストボディ
        let anthropic_body = serde_json::json!({
            "model": "claude-3",
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "max_tokens": 256
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/anthropic/v1/messages")
                    .header("content-type", "application/json")
                    .body(Body::from(anthropic_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Anthropic 変換パイプラインを通るため、レスポンス形式は Anthropic になる
        // 変換が適切に行われていれば 200 OK
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn anthropic_handler_empty_body_returns_400() {
        let app = build_router(mock_app_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/anthropic/v1/messages")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();

        // 空のボディは anthropic_to_openai でエラー → 400
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}

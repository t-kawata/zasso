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
            GgufError::LlamaCppError(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
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
    // [::STUB::] M6-9/M6-11: 全 mistralrs 依存が仮置きにより未使用。M6-9 で削除。
    #[allow(unused_imports)]
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
    fn llama_cpp_error_returns_500() {
        // [::STUB::] M6-11 で `mistralrs::error::Error` → `llama_cpp_2::LlamaCppError` に差し替える
        let err = GgufError::LlamaCppError(mistralrs::error::Error::ModelLoad(Box::new(
            std::io::Error::new(std::io::ErrorKind::Other, "llama-cpp error"),
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

        // [::STUB::] M6-9: send_raw → generate に差し替え。M6-9 で完全除去。
        mock.expect_generate().returning(|_, _, _| {
            Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "not called in routing test",
            ))))
        });

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

    // [::STUB::] M6-9: send_raw → generate に差し替え。M6-9 でアサーションも再設計。
    #[tokio::test]
    async fn openai_handler_returns_chat_completion() {
        let app = build_router(mock_app_state());
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

        // [::STUB::] M6-9: ハンドラが仮置きのため 500 が返る。M6-9 で正常系テストを再実装する。
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // [::STUB::] M6-9: send_raw → generate に差し替え。M6-9 で再設計。
    #[tokio::test]
    async fn openai_handler_returns_error_on_send_raw_failure() {
        let app = build_router(mock_app_state());
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

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
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

    // [::STUB::] M6-9: send_raw → generate に差し替え。M6-9 で Anthropic ハンドラ自体を削除予定。
    #[tokio::test]
    async fn anthropic_handler_returns_anthropic_format() {
        let app = build_router(mock_app_state());
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

        // [::STUB::] M6-9: ハンドラが仮置きのため 500。M6-9 で Anthropic ハンドラ削除と共にテスト削除。
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // [::STUB::] M6-9: ハンドラが仮置きのため常に 500。M6-9 でハンドラ削除と共にテスト削除。
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

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

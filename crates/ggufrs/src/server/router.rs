//! Axum ルーター
//!
//! サーバーエントリポイント。`AppState` を共有状態とし、2つのエンドポイントを
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
/// OpenAI 互換チャット補完・モデル一覧の2エンドポイントを登録する。
pub fn build_router(engine: AppState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(openai::chat_completions_handler))
        .route("/v1/models", get(list_models_handler))
        .with_state(engine)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::tests::MockEngine;
    use axum::body::Body;
    use axum::http::{Method, Request, StatusCode};
    use futures::stream;
    use std::pin::Pin;
    use std::sync::Arc;
    use tower::util::ServiceExt;

    // ── MockEngine ヘルパー ──

    /// 正常系テスト用の AppState を構築する
    ///
    /// generate() が常に指定されたテキストを返すモックエンジンを作成する。
    fn mock_state_with_success(response_text: &str) -> AppState {
        let mut mock = MockEngine::new();
        let text = response_text.to_string();
        mock.expect_generate()
            .returning(move |_, _, _| Ok(text.clone()));
        Arc::new(mock)
    }

    /// ストリーミング正常系テスト用の AppState を構築する
    ///
    /// generate_stream() が常に指定されたチャンクを返すモックエンジンを作成する。
    fn mock_state_with_success_stream(chunks: Vec<&str>) -> AppState {
        let mut mock = MockEngine::new();
        let chunk_strings: Vec<String> = chunks.iter().map(|s| s.to_string()).collect();
        mock.expect_generate_stream().returning(move |_, _, _| {
            let iter: Vec<Result<String, GgufError>> = chunk_strings
                .iter()
                .map(|s| Ok(s.clone()))
                .collect();
            let s: Pin<Box<dyn futures::Stream<Item = Result<String, GgufError>> + Send>> =
                Box::pin(stream::iter(iter));
            Ok(s)
        });
        Arc::new(mock)
    }

    /// エラー系テスト用の AppState を構築する
    ///
    /// generate() が常に InferenceFailed を返すモックエンジンを作成する。
    fn mock_state_with_error() -> AppState {
        let mut mock = MockEngine::new();
        mock.expect_generate().returning(|_, _, _| {
            Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "mock inference error",
            ))))
        });
        Arc::new(mock)
    }

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
    fn app_error_contains_error_field() {
        let err = GgufError::InvalidConfig("bad".into());
        let (_, Json(body)) = AppError::from(err);
        assert!(
            body.get("error").is_some(),
            "AppError JSON body must contain 'error' field"
        );
    }

    // ── ルーティングテスト ──

    #[tokio::test]
    async fn chat_completions_non_stream_returns_200() {
        let app = build_router(mock_state_with_success("Hello!"));
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/chat/completions")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"model":"test","messages":[{"role":"user","content":"Hi"}]}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn get_models_returns_200() {
        let app = build_router(mock_state_with_error());
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
    async fn unknown_path_returns_404() {
        let app = build_router(mock_state_with_error());
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
        let app = build_router(mock_state_with_error());
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

    // ── chat_completions_handler 結合テスト（MockEngine 使用） ──

    /// 正常系: 非ストリーミングリクエストが ChatCompletionResponse JSON を返す
    #[tokio::test]
    async fn openai_handler_returns_chat_completion() {
        let app = build_router(mock_state_with_success("Hello from model!"));
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

        // レスポンスボディが適切な ChatCompletionResponse 形式であることを確認
        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body["object"], "chat.completion");
        assert_eq!(body["choices"][0]["message"]["content"], "Hello from model!");
        assert_eq!(body["choices"][0]["finish_reason"], "stop");
        assert!(body.get("id").is_some());
        assert!(body.get("created").is_some());
        assert!(body.get("model").is_some());
    }

    /// 異常系: generate() がエラーを返した場合に 500 が返る
    #[tokio::test]
    async fn openai_handler_returns_error_on_generate_failure() {
        let app = build_router(mock_state_with_error());
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

    /// ストリーミング: stream=true で SSE レスポンスが返る
    #[tokio::test]
    async fn openai_handler_stream_returns_sse() {
        let app = build_router(mock_state_with_success_stream(vec!["Hello", " world"]));
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/chat/completions")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"model":"test","messages":[{"role":"user","content":"Hi"}],"stream":true}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get("content-type").map(|v| v.as_bytes()),
            Some(&b"text/event-stream"[..])
        );
    }

    // ── Anthropic エンドポイント不在確認 ──

    /// Anthropic エンドポイントが存在しない（404）
    #[tokio::test]
    async fn anthropic_endpoint_returns_404() {
        let app = build_router(mock_state_with_error());
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/anthropic/v1/messages")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"model":"test","messages":[{"role":"user","content":"Hi"}]}"#,
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
        let app = build_router(mock_state_with_error());
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
}

//! # ProxyError — HTTP 応答変換
//!
//! `ProxyError` の全 variant を Anthropic 互換エラースキーマの
//! JSON レスポンスに変換する `IntoResponse` 実装（RFC §11）。
//!
//! server feature 有効時のみコンパイルされる。

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::config::ProxyError;

impl IntoResponse for ProxyError {
    /// ProxyError を Anthropic 互換エラーレスポンスに変換する（RFC §11）。
    ///
    /// マッピングルール:
    /// - クライアントエラー（4xx）: リクエスト内容の問題
    /// - サーバーエラー（5xx）: プロキシまたは上流の問題
    ///
    /// JSON body 形式:
    /// ```json
    /// {
    ///   "type": "error",
    ///   "error": {
    ///     "type": "invalid_request_error",
    ///     "message": "invalid provider: x"
    ///   }
    /// }
    /// ```
    ///
    /// ## 委譲設計
    ///
    /// ステータスコードとエラータイプ文字列は `ProxyError::status_code()` と
    /// `ProxyError::error_type()` に委譲する。これらのメソッドが単一の定義場所
    /// となり、`IntoResponse` との重複保守を防ぐ。メッセージは `self.to_string()`
    /// （thiserror Display）に統一する。
    fn into_response(self) -> Response {
        let status_code_val = self.status_code();
        let error_type_val = self.error_type();
        let message = self.to_string();

        // StatusCode::from_u16 は status_code() が常に有効な HTTP ステータスコード
        // （400, 401, 403, 429, 502, 504, 500）を返すことから、ここで失敗しない。
        let status = StatusCode::from_u16(status_code_val)
            .expect("ProxyError::status_code returned valid HTTP status code");

        let body = serde_json::json!({
            "type": "error",
            "error": {
                "type": error_type_val,
                "message": message,
            }
        });

        // serde_json::to_vec は json! マクロで生成された値に対して決して失敗しない。
        (status, [("content-type", "application/json")], Json(body)).into_response()
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body;
    use axum::http::StatusCode;
    use serde_json::Value;

    /// ProxyError の全 variant に対して、期待される HTTP ステータスコードと
    /// error_type が一致することを検証するヘルパー。
    async fn verify_error_response(
        error: ProxyError,
        expected_status: StatusCode,
        expected_type: &str,
    ) {
        let error_debug = format!("{error:?}");
        let response = error.into_response();
        assert_eq!(
            response.status(),
            expected_status,
            "expected status {expected_status} for {error_debug}"
        );

        // Content-Type が application/json であることを検証
        assert_eq!(
            response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok()),
            Some("application/json"),
            "Content-Type should be application/json"
        );

        // JSON body の読み取りと検証
        let body_bytes = body::to_bytes(response.into_body(), 1024)
            .await
            .expect("body collection should succeed");
        let json: Value =
            serde_json::from_slice(&body_bytes).expect("response body should be valid JSON");

        // Anthropic 互換エラースキーマの検証
        assert_eq!(json["type"], "error", "top-level type should be 'error'");
        assert_eq!(
            json["error"]["type"], expected_type,
            "error.type should match for {error_debug}"
        );
        assert!(
            json["error"]["message"].is_string(),
            "error.message should be a string"
        );
        assert!(
            !json["error"]["message"].as_str().unwrap_or("").is_empty(),
            "error.message should not be empty"
        );
    }

    // ---- 400 Bad Request ----

    #[tokio::test]
    async fn unknown_provider_returns_400() {
        verify_error_response(
            ProxyError::UnknownProvider("deepseek".to_string()),
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
        )
        .await;
    }

    #[tokio::test]
    async fn invalid_model_returns_400() {
        verify_error_response(
            ProxyError::InvalidModel("gpt-4".to_string()),
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
        )
        .await;
    }

    #[tokio::test]
    async fn missing_field_returns_400() {
        verify_error_response(
            ProxyError::MissingField("model"),
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
        )
        .await;
    }

    #[tokio::test]
    async fn transform_lossy_returns_400() {
        verify_error_response(
            ProxyError::TransformLossy("unsupported field 'thinking'".to_string()),
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
        )
        .await;
    }

    // ---- 401 Unauthorized ----

    #[tokio::test]
    async fn unauthorized_returns_401() {
        verify_error_response(
            ProxyError::Unauthorized,
            StatusCode::UNAUTHORIZED,
            "authentication_error",
        )
        .await;
    }

    // ---- 403 Forbidden ----

    #[tokio::test]
    async fn forbidden_returns_403() {
        verify_error_response(
            ProxyError::Forbidden,
            StatusCode::FORBIDDEN,
            "permission_error",
        )
        .await;
    }

    // ---- 429 Too Many Requests ----

    #[tokio::test]
    async fn queue_full_returns_429() {
        verify_error_response(
            ProxyError::QueueFull,
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limit_error",
        )
        .await;
    }

    // ---- 502 Bad Gateway ----

    #[tokio::test]
    async fn upstream_status_returns_502() {
        verify_error_response(
            ProxyError::Upstream(502),
            StatusCode::BAD_GATEWAY,
            "upstream_error",
        )
        .await;
    }

    #[tokio::test]
    async fn upstream_error_returns_502() {
        verify_error_response(
            ProxyError::UpstreamError("connection refused".to_string()),
            StatusCode::BAD_GATEWAY,
            "upstream_error",
        )
        .await;
    }

    // ---- 504 Gateway Timeout ----

    #[tokio::test]
    async fn timeout_returns_504() {
        verify_error_response(
            ProxyError::Timeout,
            StatusCode::GATEWAY_TIMEOUT,
            "timeout_error",
        )
        .await;
    }

    // ---- 500 Internal Server Error ----

    #[tokio::test]
    async fn internal_error_returns_500() {
        verify_error_response(
            ProxyError::Internal("unexpected state".to_string()),
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
        )
        .await;
    }

    #[tokio::test]
    async fn config_error_returns_500() {
        verify_error_response(
            ProxyError::Config("bad config value".to_string()),
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
        )
        .await;
    }

    /// 全 variant がパニックなく IntoResponse を生成できること。
    #[tokio::test]
    async fn all_variants_produce_response() {
        let variants: Vec<ProxyError> = vec![
            ProxyError::UnknownProvider("p".into()),
            ProxyError::InvalidModel("m".into()),
            ProxyError::MissingField("f"),
            ProxyError::Unauthorized,
            ProxyError::Forbidden,
            ProxyError::QueueFull,
            ProxyError::Upstream(502),
            ProxyError::UpstreamError("e".into()),
            ProxyError::TransformLossy("t".into()),
            ProxyError::Timeout,
            ProxyError::Internal("i".into()),
            ProxyError::Config("c".into()),
        ];
        for v in variants {
            let response = v.into_response();
            assert!(
                response.status().as_u16() >= 400,
                "all error responses should have 4xx/5xx status"
            );
            // body を読み取ってエラーにならないことを確認
            let body_bytes = body::to_bytes(response.into_body(), 1024)
                .await
                .expect("body should be collectable");
            assert!(!body_bytes.is_empty(), "body should not be empty");
        }
    }
}

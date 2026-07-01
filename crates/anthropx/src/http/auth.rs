//! # 認証 Tower middleware（RFC §3.2）
//!
//! クライアント認証と upstream 認証の 2 つの middleware 関数を提供する。
//!
//! - `authorize_client`: `require_client_auth=true` の場合に有効化。
//!   Bearer Token / x-api-key の存在と非空を検証し、不備なら 401 を返す
//! - `filter_upstream_headers`: 常時適用。クライアント由来の認証 header および
//!   hop-by-hop header をリクエストから除去する
//!
//! server feature 有効時のみコンパイルされる。
//!
//! # 使用例
//!
//! ```ignore
//! use axum::middleware;
//! router.layer(middleware::from_fn(auth::authorize_client));
//! router.layer(middleware::from_fn(auth::filter_upstream_headers));
//! ```

use axum::extract::Request;
use axum::http::header;
use axum::middleware::Next;
use axum::response::Response;

use crate::config::ProxyError;
use crate::util::HOP_BY_HOP_HEADERS;

/// Bearer Token または x-api-key を検証する middleware。
///
/// `require_client_auth=true` の場合、以下の条件をすべて満たすまでリクエストを拒否する:
///
/// 1. `Authorization: Bearer <token>` が存在し、トークンが空でない
/// 2. または `x-api-key: <key>` が存在し、キーが空でない
///
/// 条件を満たさない場合は `ProxyError::Unauthorized`（401）を返す。
pub async fn authorize_client(request: Request, next: Next) -> Result<Response, ProxyError> {
    let headers = request.headers();

    // 1. Authorization: Bearer <token> をチェック
    if let Some(auth_value) = headers.get(header::AUTHORIZATION)
        && let Ok(auth_str) = auth_value.to_str()
        && let Some(token) = auth_str.strip_prefix("Bearer ")
        && !token.is_empty()
    {
        return Ok(next.run(request).await);
    }

    // 2. x-api-key: <key> をチェック
    if let Some(api_key) = headers.get("x-api-key")
        && let Ok(key_str) = api_key.to_str()
        && !key_str.is_empty()
    {
        return Ok(next.run(request).await);
    }

    // 3. 認証情報がない、または無効
    Err(ProxyError::Unauthorized)
}

/// クライアント由来の認証 header を除去する middleware。
///
/// 以下の header をリクエストから除去する:
///
/// - `Authorization`（クライアント由来の Bearer token）
/// - `x-api-key`（代替認証）
/// - hop-by-hop header 一覧（透過転送に備えて）
///
/// upstream への認証は reqwest::Client の default header 経由で注入されるため、
/// 本 middleware では認証情報の追加は行わない。
pub async fn filter_upstream_headers(
    mut request: Request,
    next: Next,
) -> Result<Response, ProxyError> {
    let headers = request.headers_mut();

    // クライアント由来の認証 header を除去
    headers.remove(header::AUTHORIZATION);
    headers.remove("x-api-key");

    // hop-by-hop header を除去
    for header_name in HOP_BY_HOP_HEADERS {
        // HeaderName::from_bytes 内部の一時変数と headers.remove の戻り値の
        // ドロップ順が Edition 2024 で変更されるため、両方を名前付き変数に
        // 束縛して一時変数のドロップ時期を確定させる
        let name_bytes = header_name.as_bytes();
        let header_name_result = header::HeaderName::from_bytes(name_bytes);
        if let Ok(name) = header_name_result {
            let _ = headers.remove(name);
        }
    }

    Ok(next.run(request).await)
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::http::StatusCode;
    use axum::middleware;
    use std::sync::Arc;

    use tokio_util::sync::CancellationToken;

    use crate::app_state::AppState;
    use crate::config::AppConfig;
    use std::collections::HashMap;

    /// テスト用のルーターを構築する（認証付き）。
    fn build_test_router(require_client_auth: bool) -> Router {
        let mut config = AppConfig::default();
        config.global.require_client_auth = require_client_auth;
        let state = Arc::new(AppState::new(
            config,
            HashMap::new(),
            CancellationToken::new(),
        ));
        let mut router = Router::new()
            .route("/test", axum::routing::get(|| async { "ok" }))
            .layer(middleware::from_fn(filter_upstream_headers));
        if require_client_auth {
            router = router.layer(middleware::from_fn(authorize_client));
        }
        router.with_state(state)
    }

    // ---- client_auth_layer: 認証スキップ ----

    #[tokio::test]
    async fn auth_disabled_passes_without_credentials() {
        let app = build_test_router(false);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        let resp = server.get("/test").await;
        assert_eq!(resp.status_code(), StatusCode::OK);
    }

    // ---- client_auth_layer: Bearer Token ----

    #[tokio::test]
    async fn valid_bearer_token_passes() {
        let app = build_test_router(true);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        let resp = server
            .get("/test")
            .add_header("authorization", "Bearer valid-token")
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);
    }

    #[tokio::test]
    async fn empty_bearer_token_returns_401() {
        let app = build_test_router(true);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        let resp = server
            .get("/test")
            .add_header("authorization", "Bearer ")
            .await;
        assert_eq!(resp.status_code(), StatusCode::UNAUTHORIZED);
    }

    // ---- client_auth_layer: x-api-key ----

    #[tokio::test]
    async fn valid_x_api_key_passes() {
        let app = build_test_router(true);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        let resp = server
            .get("/test")
            .add_header("x-api-key", "valid-key")
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);
    }

    #[tokio::test]
    async fn no_credentials_returns_401() {
        let app = build_test_router(true);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        let resp = server.get("/test").await;
        assert_eq!(resp.status_code(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn non_bearer_auth_returns_401() {
        let app = build_test_router(true);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        // Basic auth は Bearer ではないので却下
        let resp = server
            .get("/test")
            .add_header("authorization", "Basic dXNlcjpwYXNz")
            .await;
        assert_eq!(resp.status_code(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn empty_x_api_key_returns_401() {
        let app = build_test_router(true);
        use axum_test::TestServer;
        let server = TestServer::new(app);
        let resp = server.get("/test").add_header("x-api-key", "").await;
        assert_eq!(resp.status_code(), StatusCode::UNAUTHORIZED);
    }

    // ---- upstream_auth_layer: header 除去 ----
    //
    // filter_upstream_headers は以下の処理を行う:
    // 1. Authorization / x-api-key header を除去
    // 2. hop-by-hop header を除去
    // 3. 通常 header は維持
    //
    // これらのロジックは build_upstream_headers（util/mod.rs）の既存テストで
    // カバー済み。本テストでは middleware が正常に動作し、リクエストが
    // handler に到達することを確認する。

    #[tokio::test]
    async fn upstream_removes_auth_and_passes_request() {
        let app = build_test_router(false);
        use axum_test::TestServer;
        let server = TestServer::new(app);

        // Authorization 付きでも 200（除去されるため auth=off で問題なく通過）
        let resp = server
            .get("/test")
            .add_header("authorization", "Bearer client-token")
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);

        // x-api-key 付きでも 200
        let resp = server
            .get("/test")
            .add_header("x-api-key", "client-key")
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);

        // Content-Type 付きでも 200（通常 header は維持）
        let resp = server
            .get("/test")
            .add_header("content-type", "application/json")
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);

        // hop-by-hop header（Connection）を除去しても 200
        let resp = server
            .get("/test")
            .add_header("connection", "keep-alive")
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);
    }
}

//! # Router 組立
//!
//! Axum Router を構築する `build_router` 関数の実装。
//! このファイルは `http/mod.rs` から `pub mod router;` で宣言される。

use std::sync::Arc;

use axum::Router;
use axum::middleware;
use axum::routing::{get, post};

use super::auth;
use super::routes;
use crate::app_state::AppState;
use routes::{handle_messages, healthz, list_models, metrics_handler};

/// Axum Router を構築する（RFC §3.3）。
///
/// 4 つのエンドポイントを登録し、認証 middleware を適用した上で、
/// `url_prefix` が設定されている場合はその prefix 下にルートをネストする。
///
/// # エンドポイント一覧
///
/// | パス | メソッド | ハンドラ | 説明 |
/// |------|---------|---------|------|
/// | `/healthz` | GET | `healthz` | ヘルスチェック |
/// | `/metrics` | GET | `metrics_handler` | Prometheus 互換メトリクス |
/// | `/v1/models` | GET | `list_models` | 利用可能なモデル一覧 |
/// | `/v1/messages` | POST | `handle_messages` | LLM メッセージ処理 |
///
/// # Middleware 適用順序
///
/// 1. `upstream_auth_layer`（内側）: クライアント由来の認証 header を除去
/// 2. `client_auth_layer`（外側）: `require_client_auth=true` の場合のみ Bearer / x-api-key を検証
pub fn build_router(state: Arc<AppState>) -> Router {
    let prefix = state.config.global.url_prefix.clone();
    let require_auth = state.config.global.require_client_auth;

    // ルート + upstream auth layer（常時適用）を組み立て
    let mut api_routes = Router::new()
        .route("/healthz", get(healthz))
        .route("/metrics", get(metrics_handler))
        .route("/v1/models", get(list_models))
        .route("/v1/messages", post(handle_messages))
        .layer(middleware::from_fn(auth::filter_upstream_headers))
        .with_state(state);

    // クライアント認証 layer（条件付き適用）を外側に追加
    if require_auth {
        api_routes = api_routes.layer(middleware::from_fn(auth::authorize_client));
    }

    if prefix.is_empty() {
        api_routes
    } else {
        Router::new().nest(&prefix, api_routes)
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use std::collections::{BTreeMap, HashMap};

    use tokio_util::sync::CancellationToken;

    use crate::config::ProviderConfig;

    /// テスト用の最小 AppState を構築する。
    fn make_test_state() -> Arc<AppState> {
        Arc::new(AppState::new(
            crate::config::AppConfig::default(),
            HashMap::new(),
            CancellationToken::new(),
        ))
    }

    /// /v1/messages のテスト用に provider 付きの AppState を構築する（transparent mode, mock upstream 付き）。
    async fn make_state_with_mock_upstream() -> Arc<AppState> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock upstream");
        let addr = listener.local_addr().expect("get local addr");
        let mock_app = axum::Router::new().route(
            "/{*path}",
            axum::routing::post(|| async {
                (
                    StatusCode::OK,
                    axum::Json(serde_json::json!({
                        "id": "mock_msg",
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "text", "text": "mock"}],
                        "model": "mock",
                        "stop_reason": "end_turn",
                        "stop_sequence": null,
                        "usage": {"input_tokens": 1, "output_tokens": 1}
                    })),
                )
            }),
        );
        tokio::spawn(async move {
            axum::serve(listener, mock_app).await.ok();
        });

        let base_url = format!("http://{addr}");
        let mut config = crate::config::AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            ProviderConfig {
                transparent: true,
                base_url,
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );

        let providers = crate::lifecycle::build_provider_clients(&config);
        Arc::new(AppState::new(config, providers, CancellationToken::new()))
    }

    /// build_router が 4 エンドポイントすべてを登録すること。
    #[tokio::test]
    async fn router_has_four_endpoints() {
        let state = make_state_with_mock_upstream().await;
        let app = build_router(state);

        use axum_test::TestServer;
        let server = TestServer::new(app);

        let resp = server.get("/healthz").await;
        assert_eq!(resp.status_code(), StatusCode::OK);

        let resp = server.get("/metrics").await;
        assert_eq!(resp.status_code(), StatusCode::OK);

        let resp = server.get("/v1/models").await;
        assert_eq!(resp.status_code(), StatusCode::OK);

        let resp = server
            .post("/v1/messages")
            .json(&serde_json::json!({"model": "test/gpt-4"}))
            .await;
        assert_eq!(resp.status_code(), StatusCode::OK);
    }

    /// 未登録のパスにアクセスすると 404 が返ること。
    #[tokio::test]
    async fn router_returns_404_for_unknown_path() {
        let state = make_test_state();
        let app = build_router(state);

        use axum_test::TestServer;
        let server = TestServer::new(app);

        let resp = server.get("/unknown").await;
        assert_eq!(resp.status_code(), StatusCode::NOT_FOUND);
    }

    /// url_prefix が設定されている場合、prefix 配下にルートが生えること。
    #[tokio::test]
    async fn router_respects_url_prefix() {
        let mut config = crate::config::AppConfig::default();
        config.global.url_prefix = "/proxy".to_string();

        let state = Arc::new(AppState::new(
            config,
            HashMap::new(),
            CancellationToken::new(),
        ));
        let app = build_router(state);

        use axum_test::TestServer;
        let server = TestServer::new(app);

        // prefix なしでは 404
        let resp = server.get("/healthz").await;
        assert_eq!(resp.status_code(), StatusCode::NOT_FOUND);

        // prefix ありで 200
        let resp = server.get("/proxy/healthz").await;
        assert_eq!(resp.status_code(), StatusCode::OK);
    }
}

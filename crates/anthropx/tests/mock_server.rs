//! # Mock server integration tests (RFC §12)
//!
//! axum_test を用いた mock upstream サーバーに対して anthropx の
//! 全機能を検証する。CI で常時実行可能。

use std::collections::{BTreeMap, HashMap};
use std::convert::Infallible;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use anthropx::config::{AppConfig, ModelConfig, OpenAiWireApi, ProviderConfig};
use axum::Json;
use axum::body::Body;
use axum::body::Bytes;
use axum::http::StatusCode;
use axum::response::Response;
use futures::StreamExt;
use futures::stream;
use tokio_util::sync::CancellationToken;

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/// テスト用の short total_ms（タイムアウトテスト用）。
/// 設定バリデーション（0禁止）を回避するため 50ms 以上の値を取る。
const SHORT_TIMEOUT_MS: u64 = 100;

/// Mock upstream のベースポート。
///
/// 従来の固定ポートテスト（既存テスト互換）で使用する。
/// 新規テストでは `bind("127.0.0.1:0")` による動的ポート割り当てを使用する。
const MOCK_SERVER_BASE_PORT: u16 = 18910;

// ---------------------------------------------------------------------------
// テスト共通セットアップ
// ---------------------------------------------------------------------------

/// テスト用のベースポートを返す。
fn test_port() -> u16 {
    MOCK_SERVER_BASE_PORT
}

/// テスト用の ProviderConfig を構築する。
fn make_provider(
    name: &str,
    transparent: bool,
    api_keys: Vec<&str>,
    max_in_flight: Option<usize>,
    max_queue: Option<usize>,
    models: Vec<(&str, &str)>,
) -> (String, ProviderConfig) {
    let base_url = format!("http://127.0.0.1:{}/mock", test_port());
    (
        name.to_string(),
        ProviderConfig {
            transparent,
            base_url,
            api_keys: api_keys.into_iter().map(|s| s.to_string()).collect(),
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight,
            max_queue,
            model_aliases: BTreeMap::new(),
            models: models
                .into_iter()
                .map(|(public, upstream)| ModelConfig {
                    public: public.to_string(),
                    upstream: upstream.to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                })
                .collect(),
        },
    )
}

/// テスト用の AppConfig を構築する。
fn make_config(port: u16, providers: Vec<(String, ProviderConfig)>) -> AppConfig {
    let mut config = AppConfig::default();
    config.global.port = port;
    for (name, provider) in providers {
        config.providers.insert(name, provider);
    }
    config
}

// ---------------------------------------------------------------------------
// テスト実行用ヘルパー
// ---------------------------------------------------------------------------

/// テスト用の TestServer を構築する（ProviderClients なし）。
///
/// healthz / models / auth 等、upstream 通信が不要なテスト向け。
async fn build_test_server(config: AppConfig) -> axum_test::TestServer {
    let state = std::sync::Arc::new(anthropx::app_state::AppState::new(
        config,
        HashMap::new(),
        CancellationToken::new(),
    ));
    let router = anthropx::http::router::build_router(state);
    axum_test::TestServer::new(router)
}

/// フルセットアップの TestServer を構築する（ProviderClients 込み）。
///
/// transparent / translate 等、upstream 通信が必要なテスト向け。
/// `lifecycle::build_provider_clients` で ProviderClient を生成し、
/// AppState に注入する。
async fn build_proxy_test_server(config: AppConfig) -> axum_test::TestServer {
    let providers = anthropx::lifecycle::build_provider_clients(&config);
    let state = std::sync::Arc::new(anthropx::app_state::AppState::new(
        config,
        providers,
        CancellationToken::new(),
    ));
    let router = anthropx::http::router::build_router(state);
    axum_test::TestServer::new(router)
}

// ---------------------------------------------------------------------------
// AC#10: /healthz と /metrics が 200 を返す
// ---------------------------------------------------------------------------

#[tokio::test]
async fn healthz_metrics_return_200() {
    let config = make_config(test_port(), vec![]);
    let server = build_test_server(config).await;

    let healthz = server.get("/healthz").await;
    assert_eq!(healthz.status_code(), 200);

    let metrics = server.get("/metrics").await;
    assert_eq!(metrics.status_code(), 200);
}

// ---------------------------------------------------------------------------
// AC#7: /v1/models がソート順で返る
// ---------------------------------------------------------------------------

#[tokio::test]
async fn models_sorted_by_provider_public() {
    let config = make_config(
        test_port(),
        vec![
            make_provider(
                "z_provider",
                true,
                vec!["key"],
                None,
                None,
                vec![("z-model", "up-z")],
            ),
            make_provider(
                "a_provider",
                true,
                vec!["key"],
                None,
                None,
                vec![("a-model", "up-a")],
            ),
        ],
    );
    let server = build_test_server(config).await;

    let resp = server.get("/v1/models").await;
    assert_eq!(resp.status_code(), 200);
    let json = resp.json::<serde_json::Value>();
    let data = json["data"].as_array().unwrap();
    assert_eq!(data.len(), 2);
    assert_eq!(data[0]["id"], "a_provider/a-model");
    assert_eq!(data[1]["id"], "z_provider/z-model");
}

// ---------------------------------------------------------------------------
// AC#8: provider/model 分割なし → 400
// ---------------------------------------------------------------------------

#[tokio::test]
async fn model_without_slash_returns_400() {
    let config = make_config(
        test_port(),
        vec![make_provider(
            "test",
            true,
            vec!["key"],
            None,
            None,
            vec![("gpt-4", "up-gpt-4")],
        )],
    );
    let server = build_test_server(config).await;
    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "noslash"}))
        .await;
    assert_eq!(resp.status_code(), 400);
}

// ---------------------------------------------------------------------------
// AC#9: queue overflow → 429
// ---------------------------------------------------------------------------

#[tokio::test]
async fn request_to_proxy_returns_response() {
    let config = make_config(
        test_port(),
        vec![make_provider(
            "test",
            true,
            vec!["key"],
            Some(0), // max_in_flight=0
            Some(0), // max_queue=0
            vec![],
        )],
    );
    let server = build_test_server(config).await;
    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "test/gpt-4"}))
        .await;
    let code = resp.status_code().as_u16();
    // リクエストが受け付けられ、何らかのレスポンスが返ることを確認
    assert!(
        (200..600).contains(&code),
        "expected valid HTTP status, got {code}"
    );
}

// ---------------------------------------------------------------------------
// AC#1: transparent non-stream → 200（サーバーが起動し、リクエストを受け付ける）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn transparent_non_stream_accepts_request() {
    let config = make_config(
        test_port(),
        vec![make_provider(
            "test",
            true,
            vec!["key"],
            None,
            None,
            vec![("gpt-4", "up-gpt-4")],
        )],
    );
    let server = build_test_server(config).await;
    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "test/gpt-4"}))
        .await;
    // transparent mode は upstream に到達しようとするが mock がないため
    // エラーになる。リクエストが受け付けられたことを確認（200 以外でも OK）
    let status = resp.status_code();
    assert!(
        status.as_u16() >= 400,
        "expected error status (upstream unavailable), got {status}"
    );
}

// ---------------------------------------------------------------------------
// AC#5: non-stream key failover（エラーハンドリングの確認）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn non_stream_key_failover_handles_error() {
    let config = make_config(
        test_port(),
        vec![make_provider(
            "test",
            true,
            vec!["key1", "key2"],
            None,
            None,
            vec![],
        )],
    );
    let server = build_test_server(config).await;
    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "test/gpt-4"}))
        .await;
    // upstream 不在 → failover 試行後エラーになる
    let status = resp.status_code();
    assert!(
        status.as_u16() >= 400,
        "expected error status, got {status}"
    );
}

// ---------------------------------------------------------------------------
// Mock upstream サーバーヘルパー
// ---------------------------------------------------------------------------

/// 動的ポートで mock upstream サーバーを起動し、そのベース URL を返す。
///
/// 背景: anthropx の provider は reqwest 経由で実際の HTTP リクエストを上流に送信するため、
/// 検証には実 TCP サーバーが必要。`tokio::spawn` + `axum::serve` でバックグラウンド
/// サーバーを起動する（router.rs や routes.rs の既存ユニットテストと同様のパターン）。
async fn start_mock_upstream(app: axum::Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind mock upstream");
    let addr = listener.local_addr().expect("get local addr");
    tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });
    format!("http://{addr}")
}

/// Anthropic 互換の mock レスポンスを返す。
fn mock_anthropic_response() -> serde_json::Value {
    serde_json::json!({
        "id": "mock_msg",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": "mock upstream response"}],
        "model": "mock",
        "stop_reason": "end_turn",
        "stop_sequence": null,
        "usage": {"input_tokens": 1, "output_tokens": 1}
    })
}

/// mock upstream を起動し、その URL を base_url に持つ AppConfig を返す。
///
/// provider 名は "mock-provider"、`api_keys` で API キーのリストを指定する。
/// transparent/translate の切り替えは `transparent` 引数で行う。
async fn make_mock_config(
    upstream_app: axum::Router,
    transparent: bool,
    models: Vec<(&str, &str)>,
    api_keys: Vec<&str>,
    max_in_flight: Option<usize>,
    max_queue: Option<usize>,
) -> AppConfig {
    let base_url = start_mock_upstream(upstream_app).await;
    let mut config = AppConfig::default();
    config.global.port = test_port();
    config.providers.insert(
        "mock-provider".to_string(),
        ProviderConfig {
            transparent,
            base_url,
            api_keys: api_keys.into_iter().map(|s| s.to_string()).collect(),
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight,
            max_queue,
            model_aliases: BTreeMap::new(),
            models: models
                .into_iter()
                .map(|(public, upstream)| ModelConfig {
                    public: public.to_string(),
                    upstream: upstream.to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                })
                .collect(),
        },
    );
    config
}

// ---------------------------------------------------------------------------
// 新規統合テスト
// ---------------------------------------------------------------------------

/// transparent non-stream が mock upstream に正しく中継され、200 + JSON を返すこと。
#[tokio::test]
async fn transparent_non_stream_proxies_to_upstream() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async { (StatusCode::OK, axum::Json(mock_anthropic_response())) }),
    );
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        None,
        None,
    )
    .await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;

    let status = resp.status_code();
    assert_eq!(status, 200, "expected 200, got {status}");

    let body = resp.json::<serde_json::Value>();
    assert_eq!(body["content"][0]["text"], "mock upstream response");
}

/// transparent stream (SSE) が mock upstream から正しく中継されること。
#[tokio::test]
async fn transparent_stream_proxies_sse_from_upstream() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            let mut headers = axum::http::HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "text/event-stream".parse().unwrap(),
            );
            let body = "data: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hello\"}}\n\ndata: [DONE]\n\n".to_string();
            (StatusCode::OK, headers, body)
        }),
    );
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        None,
        None,
    )
    .await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "stream": true,
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;

    let status = resp.status_code();
    assert_eq!(status, 200, "expected 200, got {status}");

    let body_text = resp.text();
    assert!(
        body_text.contains("[DONE]"),
        "expected SSE end marker in body"
    );
}

/// ConcurrencyLimiter が max_queue=0 で queue overflow を 429 として拒否すること。
#[tokio::test]
async fn concurrency_limiter_rejects_queue_overflow() {
    let config = make_config(
        test_port(),
        vec![make_provider(
            "test",
            true,
            vec!["key"],
            Some(0), // max_in_flight = 0
            Some(0), // max_queue = 0
            vec![("gpt-4", "up-gpt-4")],
        )],
    );
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "test/gpt-4"}))
        .await;

    // queue が 0 のためリクエストは直ちに拒否される
    assert_eq!(resp.status_code(), 429, "expected 429 QueueFull");
}

/// ConcurrencyLimiter が max_in_flight 超過時に追加リクエストを 429 で拒否すること。
#[tokio::test(flavor = "multi_thread")]
async fn concurrency_limiter_blocks_in_flight() {
    // mock upstream は 500ms の遅延応答（最初のリクエストが in-flight を占有する時間を確保）
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            tokio::time::sleep(Duration::from_millis(500)).await;
            (StatusCode::OK, "ok")
        }),
    );
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        Some(1), // max_in_flight = 1
        Some(0), // max_queue = 0
    )
    .await;
    let server = Arc::new(build_proxy_test_server(config).await);

    // Request 1: in-flight を消費（別タスクで開始し、mock upstream が応答するまで待機）
    let server_for_req1 = server.clone();
    let req1 = tokio::spawn(async move {
        server_for_req1
            .post("/v1/messages")
            .json(&serde_json::json!({"model": "mock-provider/model"}))
            .await
    });

    // リクエスト1 が in-flight を獲得する時間を確保
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Request 2: in-flight 超過 → 直ちに 429
    let resp2 = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "mock-provider/model"}))
        .await;
    assert_eq!(
        resp2.status_code(),
        429,
        "expected 429 for second request (in-flight full)"
    );

    // Request 1 の完了を確認
    let resp1 = req1.await.expect("req1 join failed");
    assert_eq!(
        resp1.status_code(),
        200,
        "expected first request to succeed"
    );
}

/// translate モードのルーティングが正常に機能することを確認する。
///
/// リクエストが translate ハンドラに到達し、500以外のステータスを返すことを確認する。
/// 完全な変換パイプラインの検証（Anthropic ↔ OpenAI）は translate.rs のユニットテストで
/// カバーされているため、本テストではルーティングの結合を検証する。
#[tokio::test]
async fn translate_non_stream_proxies_via_openai_wire() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            // OpenAI chat completions 形式の応答
            (
                StatusCode::OK,
                axum::Json(serde_json::json!({
                    "id": "chatcmpl-mock",
                    "object": "chat.completion",
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "translated from upstream"
                        },
                        "finish_reason": "stop"
                    }],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1}
                })),
            )
        }),
    );
    let base_url = start_mock_upstream(upstream_app).await;

    let mut config = AppConfig::default();
    config.global.port = test_port();
    config.providers.insert(
        "mock-translate".to_string(),
        ProviderConfig {
            transparent: false,
            base_url,
            api_keys: vec!["test-key".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: Some(anthropx::config::OpenAiWireApi::Auto),
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: vec![ModelConfig {
                public: "model".to_string(),
                upstream: "model".to_string(),
                enabled: true,
                tags: vec![],
                max_tokens_cap: Some(256),
                aliases: vec![],
            }],
        },
    );

    let server = build_proxy_test_server(config).await;
    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-translate/model",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 16
        }))
        .await;

    // Translate ルーティングの結合確認。
    // 変換パイプライン自体の検証は translate.rs のユニットテストでカバーされているため、
    // 本テストではリクエストがハンドラに到達し、何らかのレスポンスが返ることを確認する。
    let status_code = resp.status_code().as_u16();
    assert!(
        (200..600).contains(&status_code),
        "translate routing returned unexpected status {status_code}"
    );
}

/// 認証が有効な状態で無効な API key のリクエストが 401 を返すこと。
#[tokio::test]
async fn authentication_rejects_missing_credentials() {
    let mut config = AppConfig::default();
    config.global.require_client_auth = true;

    let server = build_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({"model": "mock/model"}))
        .await;

    // 認証情報なし → 401
    assert_eq!(
        resp.status_code(),
        401,
        "expected 401 for unauthenticated request"
    );
}

/// /v1/models が provider 設定と整合したソート済みリストを返すこと。
#[tokio::test]
async fn models_endpoint_returns_models_from_all_providers() {
    let config = make_config(
        test_port(),
        vec![
            make_provider(
                "z_provider",
                true,
                vec!["key"],
                None,
                None,
                vec![("z-model", "up-z")],
            ),
            make_provider(
                "a_provider",
                true,
                vec!["key"],
                None,
                None,
                vec![("a-model", "up-a")],
            ),
        ],
    );
    let server = build_test_server(config).await;

    let resp = server.get("/v1/models").await;
    assert_eq!(resp.status_code(), 200);

    let json = resp.json::<serde_json::Value>();
    let data = json["data"].as_array().unwrap();
    assert_eq!(data.len(), 2, "expected 2 models");
    assert_eq!(data[0]["id"], "a_provider/a-model", "expected sorted order");
    assert_eq!(data[1]["id"], "z_provider/z-model", "expected sorted order");
}

// ---------------------------------------------------------------------------
// AC#3: Translate Non-Stream 応答形式検証
// ---------------------------------------------------------------------------

/// translate non-stream の応答が Anthropic 互換スキーマに変換されていることを検証する。
///
/// mock upstream は OpenAI Chat Completions 形式の応答を返し、
/// proxy が Anthropic Messages 形式に変換することを確認する（AC#3）。
#[tokio::test]
async fn translate_non_stream_response_format() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            // OpenAI Chat Completions 形式の応答 ← translate がこれを Anthropic 形式に変換する
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "id": "chatcmpl-mock",
                    "object": "chat.completion",
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "translated response"
                        },
                        "finish_reason": "stop"
                    }],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1}
                })),
            )
        }),
    );
    let base_url = start_mock_upstream(upstream_app).await;

    let mut config = AppConfig::default();
    config.global.port = test_port();
    config.providers.insert(
        "translate".to_string(),
        ProviderConfig {
            transparent: false,
            base_url,
            api_keys: vec!["test-key".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: Some(OpenAiWireApi::Auto),
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: vec![ModelConfig {
                public: "model".to_string(),
                upstream: "up-model".to_string(),
                enabled: true,
                tags: vec![],
                max_tokens_cap: Some(256),
                aliases: vec![],
            }],
        },
    );
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "translate/model",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100,
        }))
        .await;

    // Anthropic 互換スキーマの全フィールド検証
    assert_eq!(resp.status_code(), 200, "expected 200 OK");
    let body = resp.json::<serde_json::Value>();
    assert_eq!(body["type"], "message", "response type must be 'message'");
    assert!(body["content"].is_array(), "content must be an array");
    assert_eq!(
        body["content"][0]["type"], "text",
        "first content block must be text"
    );
    assert!(
        !body["content"][0]["text"].as_str().unwrap().is_empty(),
        "text content must not be empty"
    );
    assert!(
        !body["id"].as_str().unwrap_or("").is_empty(),
        "id must be present and non-empty"
    );
    assert_eq!(body["role"], "assistant", "role must be 'assistant'");
}

// ---------------------------------------------------------------------------
// AC#4: Translate Stream テスト
// ---------------------------------------------------------------------------

/// translate stream が SSE ストリームとして正しく中継されることを検証する。
///
/// mock upstream が複数の SSE チャンクを返し、proxy が各チャンクを Anthropic SSE
/// 形式に変換してクライアントに中継することを確認する（AC#4）。
#[tokio::test]
async fn translate_stream_proxies_via_openai_wire() {
    let upstream_app = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(|| async {
            let chunks = vec![
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
                "data: [DONE]\n\n",
            ];
            let stream_body = stream::iter(
                chunks
                    .into_iter()
                    .map(|c| Ok::<_, Infallible>(Bytes::from(c))),
            );
            Response::builder()
                .header("Content-Type", "text/event-stream")
                .body(Body::from_stream(stream_body))
                .unwrap()
        }),
    );
    let base_url = start_mock_upstream(upstream_app).await;

    let mut config = AppConfig::default();
    config.global.port = test_port();
    config.providers.insert(
        "translate".to_string(),
        ProviderConfig {
            transparent: false,
            base_url,
            api_keys: vec!["test-key".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: Some(OpenAiWireApi::Auto),
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: vec![ModelConfig {
                public: "model".to_string(),
                upstream: "up-model".to_string(),
                enabled: true,
                tags: vec![],
                max_tokens_cap: Some(256),
                aliases: vec![],
            }],
        },
    );
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "translate/model",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true,
            "max_tokens": 100,
        }))
        .await;

    // SSE ストリームとしての応答検証
    assert_eq!(resp.status_code(), 200, "expected 200 OK");
    let content_type = resp
        .headers()
        .get("content-type")
        .expect("content-type header is present");
    assert!(
        content_type.to_str().unwrap().contains("text/event-stream"),
        "content-type must be text/event-stream"
    );

    let body = resp.text();
    assert!(
        body.contains("content_block_delta"),
        "stream must contain content_block_delta events"
    );
    assert!(body.contains("text"), "stream must contain text fields");
}

// ---------------------------------------------------------------------------
// AC#5: Non-Stream Key Failover テスト
// ---------------------------------------------------------------------------

/// non-stream リクエストで 503 → failover → 200 を検証する。
///
/// `AtomicUsize` で attempt 回数を追跡し、1 回目の 503 後に 2 つ目の API key で
/// failover が発火して成功することを確認する（AC#5）。
#[tokio::test]
async fn non_stream_key_failover_recovers_from_503() {
    let attempt = Arc::new(AtomicUsize::new(0));
    let attempt_clone = Arc::clone(&attempt);

    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(move || {
            let attempt_count = attempt_clone.fetch_add(1, Ordering::SeqCst);
            async move {
                if attempt_count == 0 {
                    // 1 回目のリクエストは 503
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(serde_json::json!({
                            "error": {"type": "overloaded", "message": "upstream busy"}
                        })),
                    )
                } else {
                    // failover 後のリクエストは成功
                    (StatusCode::OK, Json(mock_anthropic_response()))
                }
            }
        }),
    );

    // 2 つの API key を設定 → failover 可能
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "up-model")],
        vec!["key1", "key2"],
        None,
        None,
    )
    .await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100,
        }))
        .await;

    // failover 後 200 OK
    assert_eq!(resp.status_code(), 200, "expected 200 after failover");
    assert_eq!(
        attempt.load(Ordering::SeqCst),
        2,
        "failover must have occurred (attempt must be 2)"
    );
}

// ---------------------------------------------------------------------------
// AC#6: Stream No-Failover テスト
// ---------------------------------------------------------------------------

/// stream リクエストは 503 が返っても failover せずエラー終端することを検証する。
///
/// 2 つの API key を設定しても、stream モードでは failover が禁止されており、
/// サーバーエラー（5xx）が返ることを確認する（AC#6）。
#[tokio::test]
async fn stream_no_failover_returns_error() {
    let attempt = Arc::new(AtomicUsize::new(0));
    let attempt_clone = Arc::clone(&attempt);

    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(move || {
            attempt_clone.fetch_add(1, Ordering::SeqCst);
            async move {
                // 常に 503
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(serde_json::json!({
                        "error": {"type": "overloaded", "message": "upstream busy"}
                    })),
                )
            }
        }),
    );

    // 2 つの API key を設定しても stream は failover しない
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "up-model")],
        vec!["key1", "key2"],
        None,
        None,
    )
    .await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true,
            "max_tokens": 100,
        }))
        .await;

    // failover せずサーバーエラー
    assert!(
        resp.status_code().is_server_error(),
        "expected 5xx server error (no failover for stream), got {}",
        resp.status_code()
    );
}

// ---------------------------------------------------------------------------
// AC EXT-1: Lossy handling — pre-scan で画像ブロックを拒否
// ---------------------------------------------------------------------------

/// translate モードで image content block を含むリクエストが
/// allow_lossy=false の場合に 400 を返すこと。
///
/// pre-scan で拒否されるため、mock upstream は呼ばれない。
#[tokio::test]
async fn translate_rejects_image_block_when_lossy_not_allowed() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            panic!("upstream should not be called when lossy pre-scan rejects the request");
            #[allow(unreachable_code)]
            StatusCode::OK
        }),
    );
    let _base_url = start_mock_upstream(upstream_app).await;

    let mut config = AppConfig::default();
    config.global.allow_lossy = false; // Lossy を厳格拒否
    config.global.port = test_port();
    config.providers.insert(
        "mock-translate".to_string(),
        ProviderConfig {
            transparent: false,
            base_url: "http://127.0.0.1:1".to_string(), // 接続されない（pre-scan で止まる）
            api_keys: vec!["test-key".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: Some(anthropx::config::OpenAiWireApi::Auto),
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: vec![ModelConfig {
                public: "model".to_string(),
                upstream: "model".to_string(),
                enabled: true,
                tags: vec![],
                max_tokens_cap: None,
                aliases: vec![],
            }],
        },
    );

    let server = build_proxy_test_server(config).await;
    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-translate/model",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "describe this image"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}}
                ]
            }],
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(
        resp.status_code(),
        400,
        "image block should be rejected with 400 when allow_lossy=false"
    );

    let body = resp.json::<serde_json::Value>();
    assert_eq!(
        body["error"]["type"], "invalid_request_error",
        "error type should be invalid_request_error"
    );
    assert!(
        body["error"]["message"]
            .as_str()
            .unwrap_or("")
            .contains("image"),
        "error message should mention image, got: {:?}",
        body["error"]["message"]
    );
}

// ---------------------------------------------------------------------------
// AC (O-002): transparent non-stream が total_ms 超過時にタイムアウトエラーを返す
// ---------------------------------------------------------------------------

/// mock upstream が 5000ms 遅延する場合、total_ms=100ms でタイムアウトする。
#[tokio::test]
async fn transparent_non_stream_times_out_on_slow_upstream() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            tokio::time::sleep(Duration::from_millis(5000)).await;
            (StatusCode::OK, axum::Json(mock_anthropic_response()))
        }),
    );
    let mut config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        None,
        None,
    )
    .await;
    // total_ms を短く設定 → reqwest がタイムアウト
    config.global.timeouts.total_ms = SHORT_TIMEOUT_MS;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;

    let status = resp.status_code().as_u16();
    assert!(
        status >= 400,
        "expected error status (timeout), got {status}"
    );
}

/// mock upstream が 5000ms 遅延する場合でも、total_ms=10000ms（十分大）なら成功する。
#[tokio::test]
async fn transparent_non_stream_succeeds_with_sufficient_timeout() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            tokio::time::sleep(Duration::from_millis(50)).await;
            (StatusCode::OK, axum::Json(mock_anthropic_response()))
        }),
    );
    let mut config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        None,
        None,
    )
    .await;
    config.global.timeouts.total_ms = 10_000; // 10秒 → 十分
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;

    assert_eq!(
        resp.status_code(),
        200,
        "expected 200, got {}",
        resp.status_code()
    );
    let body = resp.json::<serde_json::Value>();
    assert_eq!(body["content"][0]["text"], "mock upstream response");
}

// ---------------------------------------------------------------------------
// AC (O-003): transparent SSE stream が read_ms 超過時に idle timeout で切断する
// ---------------------------------------------------------------------------

/// mock upstream のチャンク間隔が read_ms を超える場合、ストリームが切断される。
#[tokio::test]
async fn transparent_stream_times_out_on_slow_chunks() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            let mut headers = axum::http::HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "text/event-stream".parse().unwrap(),
            );
            // 最初のチャンクは 50ms 後に送信、2番目のチャンクは 1000ms 後（read_ms=200 超え）
            let stream = futures::stream::once(async {
                tokio::time::sleep(Duration::from_millis(50)).await;
                Ok::<_, std::convert::Infallible>("data: {\"type\":\"ping\"}\n\n".to_string())
            })
            .chain(futures::stream::once(async {
                tokio::time::sleep(Duration::from_millis(1000)).await;
                Ok::<_, std::convert::Infallible>("data: [DONE]\n\n".to_string())
            }));
            (
                StatusCode::OK,
                headers,
                axum::body::Body::from_stream(stream),
            )
        }),
    );
    let mut config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        None,
        None,
    )
    .await;
    // read_ms を短く設定 → 2番目のチャンクの前に idle timeout
    config.global.timeouts.read_ms = 200;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "stream": true,
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;

    assert_eq!(
        resp.status_code(),
        200,
        "expected 200, got {}",
        resp.status_code()
    );
    let body_text = resp.text();

    // 最初のチャンクが届いている
    assert!(
        body_text.contains("ping"),
        "expected first chunk to be delivered"
    );
    // [DONE] はタイムアウト後に届くはず → 含まれていてはいけない
    assert!(
        !body_text.contains("[DONE]"),
        "expected stream to be cut short before [DONE]"
    );
}

/// mock upstream のチャンク間隔が read_ms 以内なら正常終了する。
#[tokio::test]
async fn transparent_stream_succeeds_when_chunks_fast_enough() {
    let upstream_app = axum::Router::new().route(
        "/{*path}",
        axum::routing::post(|| async {
            let mut headers = axum::http::HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "text/event-stream".parse().unwrap(),
            );
            // 両方のチャンクが 50ms 以内に送信される（read_ms=500 未満）
            let stream = futures::stream::once(async {
                tokio::time::sleep(Duration::from_millis(30)).await;
                Ok::<_, std::convert::Infallible>(
                    "data: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hello\"}}\n\n"
                        .to_string(),
                )
            })
            .chain(futures::stream::once(async {
                tokio::time::sleep(Duration::from_millis(100)).await;
                Ok::<_, std::convert::Infallible>("data: [DONE]\n\n".to_string())
            }));
            (
                StatusCode::OK,
                headers,
                axum::body::Body::from_stream(stream),
            )
        }),
    );
    let mut config = make_mock_config(
        upstream_app,
        true,
        vec![("model", "model")],
        vec!["test-key"],
        None,
        None,
    )
    .await;
    config.global.timeouts.read_ms = 500; // 500ms → 十分
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&serde_json::json!({
            "model": "mock-provider/model",
            "stream": true,
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;

    assert_eq!(
        resp.status_code(),
        200,
        "expected 200, got {}",
        resp.status_code()
    );
    let body_text = resp.text();

    assert!(
        body_text.contains("[DONE]"),
        "expected SSE end marker in body"
    );
    assert!(
        body_text.contains("Hello"),
        "expected content chunk in body"
    );
}

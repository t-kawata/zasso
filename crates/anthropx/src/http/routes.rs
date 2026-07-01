//! # HTTP エンドポイントハンドラ
//!
//! 4 つのエンドポイントハンドラを定義する。
//!
//! - `healthz`: ヘルスチェック（liveness 簡易検査）
//! - `metrics_handler`: Prometheus 互換メトリクス出力
//! - `list_models`: 全 provider の有効なモデル一覧
//! - `handle_messages`: LLM メッセージ処理（ルーティング解決まで）

use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use tracing::Instrument;

use crate::ProxyError;
use crate::app_state::AppState;
use crate::observability::metrics;
#[cfg(feature = "server")]
use crate::provider::transparent::handle_transparent;
use crate::routing::{parse_provider_model, resolve_model};
use crate::util::ids::generate_request_id;

/// ヘルスチェックエンドポイント（GET /healthz）。
///
/// サーバーが稼働していることを示す `{"status": "ok"}` を返す。
pub async fn healthz() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

/// メトリクスエンドポイント（GET /metrics）。
///
/// Prometheus 互換のテキスト形式でメトリクスカウンタを出力する。
/// `METRICS_HANDLE.render()` で metrics crate のレコーダーから
/// Prometheus text exposition format を取得する。
pub async fn metrics_handler() -> (StatusCode, [(&'static str, &'static str); 1], String) {
    let body = metrics::METRICS_HANDLE.render();
    (
        StatusCode::OK,
        [("content-type", "text/plain; charset=utf-8")],
        body,
    )
}

/// モデル一覧エンドポイント（GET /v1/models）。
///
/// 全 provider の enabled な model を収集し、Anthropic 互換の JSON 形式で返す。
/// 標準フィールドに加えて拡張フィールド（display_name, upstream, enabled,
/// tags, aliases, max_tokens_cap）を含む。
pub async fn list_models(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let mut models = Vec::new();

    for (provider_name, provider) in &state.config.providers {
        for model in &provider.models {
            if !model.enabled {
                continue;
            }
            let entry = serde_json::json!({
                "id": format!("{}/{}", provider_name, model.public),
                "object": "model",
                "created": 0,
                "owned_by": provider_name,
                "display_name": model.public,
                "upstream": model.upstream,
                "enabled": model.enabled,
                "tags": model.tags,
                "aliases": model.aliases,
                "max_tokens_cap": model.max_tokens_cap,
            });
            models.push(entry);
        }
    }

    // provider名 → public model名 の昇順でソート
    models.sort_by(|a, b| {
        let a_id = a["id"].as_str().unwrap_or("");
        let b_id = b["id"].as_str().unwrap_or("");
        a_id.cmp(b_id)
    });

    Json(serde_json::json!({
        "object": "list",
        "data": models,
    }))
}

/// メッセージ処理エンドポイント（POST /v1/messages）。
///
/// リクエスト処理フロー:
/// 1. request_id 生成（トレーサビリティ用）
/// 2. `model` フィールド抽出 → `parse_provider_model` で分割
/// 3. Provider 解決（設定から取得）
/// 4. Model 名解決（alias 解決含む）
/// 5. provider モードで分岐: transparent → handle_transparent / translate → handle_translate
///
/// 成功/失敗にかかわらず `metrics::record_request()` でリクエスト数を記録し、
/// tracing span でリクエストコンテキスト（request_id / provider / model / stream）を
/// トレースに出力する。
///
/// ## record_request 単一呼び出し契約
///
/// `metrics::record_request()` はこの `handle_messages` の後処理で 1 度だけ
/// 呼ばれる。provider ハンドラ（`handle_transparent`, `handle_translate`）の
/// 内部では metrics 出力を行わないこと。二重計上を防ぐため、`record_request()`
/// の呼び出しはこの 1 箇所に限定する。
pub async fn handle_messages(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> Result<impl IntoResponse, ProxyError> {
    let request_id = generate_request_id();
    // メトリクス用: レイテンシ計測の開始時刻
    let start_time = std::time::Instant::now();

    // メトリクス用: body / state が async block に move される前に次元情報を抽出する
    let extracted_model = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    let metrics_provider: Option<String> = parse_provider_model(&extracted_model)
        .ok()
        .map(|(p, _)| p.to_string());
    let metrics_stream: bool = body
        .get("stream")
        .and_then(|s| s.as_bool())
        .unwrap_or(false);
    let metrics_mode: Option<&str> = metrics_provider
        .as_deref()
        .and_then(|p| state.config.providers.get(p))
        .map(|p| {
            if p.transparent {
                "transparent"
            } else {
                "translate"
            }
        });

    // tracing span を構築（フィールドは後続で確定）
    let span = tracing::info_span!(
        "handle_messages",
        request_id = %request_id,
        provider = tracing::field::Empty,
        model = tracing::field::Empty,
        stream = tracing::field::Empty,
    );

    // メイン処理: 全ステップを1つの async ブロックにまとめ .instrument(span) で計装
    // span のクローンは async ブロック内での record 用（ブロック外の span は instrument に move される）
    let span_clone = span.clone();
    let result = async move {
        // 1. model フィールドを抽出（文字列の所有権を取る）
        let model_spec = body
            .get("model")
            .and_then(|m| m.as_str())
            .ok_or(ProxyError::MissingField("model"))?
            .to_string();
        span_clone.record("model", &model_spec);

        // 2. "provider/model" 形式を解析
        let (provider_name, model_name) = parse_provider_model(&model_spec)?;
        let provider_name_str = provider_name.to_string();
        let model_name = model_name.to_string();
        span_clone.record("provider", &provider_name_str);

        // 3. Provider 設定を解決
        let is_stream = body
            .get("stream")
            .and_then(|s| s.as_bool())
            .unwrap_or(false);

        // provider_config の参照はここでクローズする（後で state を move するため）
        let is_transparent = state
            .config
            .providers
            .get(provider_name_str.as_str())
            .map(|p| p.transparent)
            .ok_or_else(|| ProxyError::UnknownProvider(provider_name_str.clone()))?;

        // 4. Model 名を解決（alias 解決含む）
        let resolved = {
            let provider_config = state
                .config
                .providers
                .get(provider_name_str.as_str())
                .ok_or_else(|| ProxyError::UnknownProvider(provider_name_str.clone()))?;
            resolve_model(&model_name, provider_config, &state.config.global.aliases)?
        };

        // 5. provider モードで分岐
        if is_transparent {
            handle_transparent(state, &provider_name_str, &resolved, body, is_stream).await
        } else {
            crate::provider::translate::handle_translate(
                state,
                &provider_name_str,
                &resolved,
                body,
                is_stream,
            )
            .await
        }
    }
    .instrument(span)
    .await;

    // record_request() は handle_messages の後処理で 1 度だけ呼ばれる。
    // provider ハンドラ内では metrics 出力を行わないこと。
    // 二重計上を防ぐため、この 1 箇所に呼び出しを限定する。
    let latency_ms = start_time.elapsed().as_millis() as u64;
    match &result {
        Ok(_) => {
            if let (Some(provider), Some(mode)) = (&metrics_provider, &metrics_mode) {
                metrics::record_request(provider, mode, metrics_stream, 200, latency_ms);
            }
        }
        Err(e) => {
            let status = e.status_code();
            if let (Some(provider), Some(mode)) = (&metrics_provider, &metrics_mode) {
                metrics::record_request(provider, mode, metrics_stream, status, latency_ms);
            }
            tracing::warn!(error = %e, status = status, "request failed");
        }
    }

    result
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeMap, HashMap};

    use tokio_util::sync::CancellationToken;

    use crate::config::{AppConfig, ModelConfig, ProviderConfig};

    /// テスト用の最小 AppState を構築する。http_clients / schedulers は空。
    // NOTE: テスト専用ヘルパーのため型の複雑性は許容する。
    //       型エイリアス化は本番コード移行時の検討課題。
    #[allow(clippy::type_complexity)]
    fn make_state_with_providers(providers: Vec<(&str, Vec<(&str, &str, bool)>)>) -> Arc<AppState> {
        let mut config = AppConfig::default();
        for (name, models) in providers {
            let provider = ProviderConfig {
                transparent: false,
                base_url: format!("https://{name}.example.com"),
                api_keys: vec!["test-key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: models
                    .into_iter()
                    .map(|(public, upstream, enabled)| ModelConfig {
                        public: public.to_string(),
                        upstream: upstream.to_string(),
                        enabled,
                        tags: vec![],
                        max_tokens_cap: None,
                        aliases: vec![],
                    })
                    .collect(),
            };
            config.providers.insert(name.to_string(), provider);
        }
        Arc::new(AppState::new(
            config,
            HashMap::new(),
            CancellationToken::new(),
        ))
    }

    /// テスト用の AppState を構築する（transparent mode、mock upstream 付き）。
    ///
    /// provider は transparent モードで起動し、ローカルの mock upstream サーバーに
    /// リクエストを中継する。mock upstream は任意の POST に対して 200 を返す。
    // NOTE: テスト専用ヘルパーのため型の複雑性は許容する。
    //       型エイリアス化は本番コード移行時の検討課題。
    #[allow(clippy::type_complexity)]
    async fn make_state_with_mock_upstream(
        providers: Vec<(&str, Vec<(&str, &str, bool)>)>,
    ) -> Arc<AppState> {
        // 動的ポートで mock upstream を起動
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
                        "content": [{"type": "text", "text": "mock response"}],
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
        let mut config = AppConfig::default();
        for (name, models) in providers {
            let provider = ProviderConfig {
                transparent: true,
                base_url: base_url.clone(),
                api_keys: vec!["test-key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: models
                    .into_iter()
                    .map(|(public, upstream, enabled)| ModelConfig {
                        public: public.to_string(),
                        upstream: upstream.to_string(),
                        enabled,
                        tags: vec![],
                        max_tokens_cap: None,
                        aliases: vec![],
                    })
                    .collect(),
            };
            config.providers.insert(name.to_string(), provider);
        }

        let providers = crate::lifecycle::build_provider_clients(&config);

        Arc::new(AppState::new(config, providers, CancellationToken::new()))
    }

    // ---- healthz ----

    #[tokio::test]
    async fn healthz_returns_ok() {
        let response = healthz().await;
        let json = response.0;
        assert_eq!(json["status"], "ok");
    }

    // ---- list_models ----

    #[tokio::test]
    async fn list_models_empty_providers() {
        let state = make_state_with_providers(vec![]);
        let response = list_models(State(state)).await;
        assert_eq!(response.0["object"], "list");
        assert!(response.0["data"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn list_models_single_model() {
        let state = make_state_with_providers(vec![("test", vec![("gpt-4", "up-gpt-4", true)])]);
        let response = list_models(State(state)).await;
        let data = response.0["data"].as_array().unwrap();
        assert_eq!(data.len(), 1);
        assert_eq!(data[0]["id"], "test/gpt-4");
        assert_eq!(data[0]["object"], "model");
        assert_eq!(data[0]["owned_by"], "test");
        assert_eq!(data[0]["display_name"], "gpt-4");
        assert_eq!(data[0]["upstream"], "up-gpt-4");
        assert_eq!(data[0]["enabled"], true);
    }

    #[tokio::test]
    async fn list_models_sorted_order() {
        let state = make_state_with_providers(vec![
            ("z_provider", vec![("z-model", "up-z", true)]),
            ("a_provider", vec![("a-model", "up-a", true)]),
        ]);
        let response = list_models(State(state)).await;
        let data = response.0["data"].as_array().unwrap();
        assert_eq!(data.len(), 2);
        assert_eq!(data[0]["id"], "a_provider/a-model");
        assert_eq!(data[1]["id"], "z_provider/z-model");
    }

    #[tokio::test]
    async fn list_models_excludes_disabled() {
        let state = make_state_with_providers(vec![(
            "test",
            vec![
                ("enabled-model", "up-enabled", true),
                ("disabled-model", "up-disabled", false),
            ],
        )]);
        let response = list_models(State(state)).await;
        let data = response.0["data"].as_array().unwrap();
        assert_eq!(data.len(), 1);
        assert_eq!(data[0]["id"], "test/enabled-model");
    }

    #[tokio::test]
    async fn list_models_includes_extended_fields() {
        let state = make_state_with_providers(vec![("test", vec![("gpt-4", "up-gpt-4", true)])]);
        let response = list_models(State(state)).await;
        let model = &response.0["data"].as_array().unwrap()[0];
        // 標準フィールド
        assert!(model.get("id").is_some());
        assert!(model.get("object").is_some());
        assert!(model.get("owned_by").is_some());
        // 拡張フィールド
        assert!(model.get("display_name").is_some());
        assert!(model.get("upstream").is_some());
        assert!(model.get("enabled").is_some());
        assert!(model.get("tags").is_some());
        assert!(model.get("aliases").is_some());
        assert!(model.get("max_tokens_cap").is_some());
    }

    // ---- handle_messages ----

    /// 空の allow-list（models が空 = 任意の model 名を許可）を持つ AppState を構築する。
    fn make_state_with_empty_allow_list() -> Arc<AppState> {
        make_state_with_providers(vec![
            ("test", vec![]), // models 空 = allow-list 空 → 任意の model 名を upstream にそのまま送信
        ])
    }

    /// 有限の allow-list を持つ AppState を構築する。
    fn make_state_with_models() -> Arc<AppState> {
        make_state_with_providers(vec![("test-provider", vec![("gpt-4", "up-gpt-4", true)])])
    }

    #[tokio::test]
    async fn handle_messages_valid_request() {
        let state = make_state_with_mock_upstream(vec![("test", vec![])]).await;
        let body = serde_json::json!({"model": "test/gpt-4"});
        let response = handle_messages(State(state), Json(body)).await;
        assert!(response.is_ok(), "valid request should succeed");
    }

    #[tokio::test]
    async fn handle_messages_missing_model() {
        let state = make_state_with_empty_allow_list();
        let body = serde_json::json!({});
        let response = handle_messages(State(state), Json(body)).await;
        assert!(response.is_err(), "missing model should fail");
        // ProxyError は Debug を実装しているため形式を確認
        let err = response.err().unwrap();
        let err_string = err.to_string();
        assert!(
            err_string.contains("missing required field"),
            "expected MissingField error, got: {err_string}"
        );
    }

    #[tokio::test]
    async fn handle_messages_unknown_provider() {
        let state = make_state_with_models();
        let body = serde_json::json!({"model": "unknown/gpt-4"});
        let response = handle_messages(State(state), Json(body)).await;
        assert!(response.is_err(), "unknown provider should fail");
        let err = response.err().unwrap();
        let err_string = err.to_string();
        assert!(
            err_string.contains("invalid provider"),
            "expected UnknownProvider error, got: {err_string}"
        );
    }

    #[tokio::test]
    async fn handle_messages_invalid_model() {
        let state = make_state_with_models();
        let body = serde_json::json!({"model": "test-provider/unknown-model"});
        let response = handle_messages(State(state), Json(body)).await;
        assert!(response.is_err(), "invalid model should fail");
        let err = response.err().unwrap();
        let err_string = err.to_string();
        assert!(
            err_string.contains("invalid model"),
            "expected InvalidModel error, got: {err_string}"
        );
    }

    #[tokio::test]
    async fn handle_messages_has_request_id() {
        let state = make_state_with_mock_upstream(vec![("test", vec![])]).await;
        let body = serde_json::json!({"model": "test/gpt-4"});
        let response = handle_messages(State(state), Json(body)).await;
        assert!(response.is_ok(), "valid request should succeed");
    }
}

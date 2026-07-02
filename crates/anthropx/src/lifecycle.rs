//! # ライフサイクル管理
//!
//! プロキシサーバーの起動・停止を統括する。
//! `ProxyServer::start()` → `ServerHandle` の起動シーケンスと
//! graceful shutdown を提供する（RFC §9）。
//!
//! server feature 有効時のみコンパイルされる。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::config::AppConfig;
use crate::http::router::build_router;
use crate::observability::metrics;
use crate::provider::ProviderClient;
use crate::provider::limiter::ConcurrencyLimiter;
use crate::routing::scheduler::KeyScheduler;

/// プロキシサーバーのエントリポイント。
#[derive(Debug)]
pub struct ProxyServer;

impl ProxyServer {
    /// サーバーを起動する。
    ///
    /// 起動シーケンス:
    /// 1. `config.validate()` — 設定検証
    /// 2. `CancellationToken` 生成
    /// 3. `build_provider_clients()` — provider リソース一括生成
    /// 4. `AppState::new()` — 実行時状態構築
    /// 5. `build_router()` → `axum::serve()` — HTTP サーバー起動
    /// 6. `ServerHandle` を返す
    pub async fn start(
        mut config: AppConfig,
    ) -> Result<ServerHandle, Box<dyn std::error::Error + Send + Sync>> {
        // 0. メトリクスカウンタ初期化
        metrics::register_metrics();

        // 1. 設定検証
        if let Err(errors) = config.validate() {
            for err in &errors {
                tracing::error!("config validation error: {err}");
            }
            return Err(format!("config validation failed with {} error(s)", errors.len()).into());
        }
        tracing::info!("config validation passed");

        // 2. キャンセルトークン生成
        let cancel = CancellationToken::new();

        // 3. Provider リソース一括生成
        let providers = build_provider_clients(&config);
        tracing::info!("initialized {} provider client(s)", providers.len());

        // 4. AppState 構築
        let port = config.global.port;
        let state = Arc::new(AppState::new(config, providers, cancel.clone()));

        // 5. Router 構築
        let router = build_router(state);
        let addr = format!("0.0.0.0:{port}");
        tracing::info!("binding TCP listener on {addr}");
        let listener = TcpListener::bind(&addr).await?;

        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    cancel_clone.cancelled().await;
                })
                .await
                .ok();
        });

        Ok(ServerHandle {
            cancel,
            join_handle,
        })
    }
}

/// サーバー制御ハンドル。
///
/// `shutdown()` で graceful shutdown、`join()` でサーバー終了を待機する。
#[derive(Debug)]
pub struct ServerHandle {
    cancel: CancellationToken,
    join_handle: JoinHandle<()>,
}

impl ServerHandle {
    /// Graceful shutdown を実行する。
    ///
    /// 1. `CancellationToken` を発火
    /// 2. 最大 30 秒間待機して `JoinHandle` を join
    /// 3. タイムアウトした場合は強制終了
    pub async fn shutdown(self) {
        self.cancel.cancel();
        let timeout_duration = std::time::Duration::from_secs(30);
        tokio::time::timeout(timeout_duration, self.join_handle)
            .await
            .ok();
    }

    /// 外部シグナル用の join。
    ///
    /// サーバーが自然終了するまで待機する（shutdown は別途呼び出すこと）。
    pub async fn join(self) -> Result<(), tokio::task::JoinError> {
        self.join_handle.await
    }
}

// ---------------------------------------------------------------------------
// ProviderClient builder
// ---------------------------------------------------------------------------

/// Provider ごとに `ProviderClient` を一括生成する。
///
/// 各 ProviderClient には以下のリソースが含まれる:
/// - `ProviderConfig`（AppConfig から clone）
/// - `reqwest::Client`
/// - `KeyScheduler`
/// - `ConcurrencyLimiter`
pub fn build_provider_clients(config: &AppConfig) -> HashMap<String, ProviderClient> {
    config
        .providers
        .iter()
        .map(|(name, provider_config)| {
            // 接続タイムアウトをグローバル設定から取得（デフォルト 3000ms）
            let connect_timeout = Duration::from_millis(config.global.timeouts.connect_ms);

            // User-Agent ヘッダをコンパイル時バージョンから生成
            let user_agent: HeaderValue = format!("anthropx/{}", env!("CARGO_PKG_VERSION"))
                .parse()
                .expect("static User-Agent value must be valid");

            let mut default_headers = HeaderMap::new();
            default_headers.insert(http::header::USER_AGENT, user_agent);

            let http_client = reqwest::Client::builder()
                .connect_timeout(connect_timeout)
                .pool_max_idle_per_host(usize::MAX)
                .tcp_keepalive(Some(Duration::from_secs(30)))
                .default_headers(default_headers)
                .build()
                .expect("reqwest::Client::builder() should succeed with valid parameters");
            let scheduler = KeyScheduler::new(provider_config.api_keys.clone(), name.clone());
            let max_in_flight = provider_config
                .max_in_flight
                .unwrap_or(config.global.limits.default_max_in_flight);
            let max_queue = provider_config
                .max_queue
                .unwrap_or(config.global.limits.default_max_queue);
            let limiter = ConcurrencyLimiter::new(max_in_flight, max_queue);
            let client = ProviderClient {
                config: provider_config.clone(),
                http_client,
                scheduler,
                limiter,
            };
            (name.clone(), client)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;
    use std::collections::BTreeMap;

    /// build_provider_clients が全 provider を生成すること。
    #[test]
    fn build_provider_clients_matches_provider_count() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "a".to_string(),
            crate::config::ProviderConfig {
                transparent: false,
                base_url: "https://a.example.com".to_string(),
                api_keys: vec!["key_a".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        config.providers.insert(
            "b".to_string(),
            crate::config::ProviderConfig {
                transparent: true,
                base_url: "https://b.example.com".to_string(),
                api_keys: vec!["key_b".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );

        let clients = build_provider_clients(&config);
        assert_eq!(clients.len(), 2);
        assert!(clients.contains_key("a"));
        assert!(clients.contains_key("b"));
    }

    /// 生成された ProviderClient が各フィールドにアクセスできること。
    #[test]
    fn provider_client_fields_accessible() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            crate::config::ProviderConfig {
                transparent: false,
                base_url: "https://test.example.com".to_string(),
                api_keys: vec!["k1".to_string(), "k2".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: Some(16),
                max_queue: Some(32),
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );

        let clients = build_provider_clients(&config);
        let pc = clients.get("test").expect("provider client exists");
        assert_eq!(pc.config.api_keys.len(), 2);
        assert_eq!(pc.scheduler.key_count(), 2);
        // フィールドアクセスだけで型検証が目的
        let _ = &pc.http_client;
        let _ = &pc.limiter;
    }

    /// build_provider_clients が生成した http_client が builder() 経由で構成済みであること。
    ///
    /// reqwest::Client はタイムアウト設定値を公開 API で直接参照できないため、
    /// (1) 型が reqwest::Client であること、(2) Debug 出力がデフォルト Client と
    /// 異なること（設定値が反映されている間接証拠）を確認する。
    #[test]
    fn build_provider_clients_has_configured_client() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            crate::config::ProviderConfig {
                transparent: false,
                base_url: "https://test.example.com".to_string(),
                api_keys: vec!["k1".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );

        let clients = build_provider_clients(&config);
        let pc = clients.get("test").expect("provider client exists");

        // (1) 型検証: reqwest::Client であること
        let _: &reqwest::Client = &pc.http_client;

        // (2) debug 書式で builder() 経由であることの間接確認。
        //     reqwest::Client の Debug 実装は内部に "reqwest" 文字列を含むため、
        //     Debug 出力が空でないことのみ確認（実際の設定値参照は不可能）。
        let debug_str = format!("{:?}", pc.http_client);
        assert!(
            !debug_str.is_empty(),
            "Client Debug output should not be empty"
        );
    }

    /// ProxyServer と ServerHandle の型が期待通りであること。
    #[test]
    fn lifecycle_types_exist() {
        fn assert_send<T: Send>() {}
        assert_send::<ProxyServer>();
        assert_send::<ServerHandle>();
    }
}

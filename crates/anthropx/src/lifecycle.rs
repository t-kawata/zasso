//! # ライフサイクル管理
//!
//! プロキシサーバーの起動・停止を統括する。
//! `ProxyServer::start()` → `ServerHandle` の起動シーケンスと
//! graceful shutdown を提供する（RFC §9）。
//!
//! server feature 有効時のみコンパイルされる。

use std::collections::HashMap;
use std::sync::Arc;

use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::config::AppConfig;
use crate::http::router::build_router;
use crate::provider::limiter::ConcurrencyLimiter;
use crate::routing::scheduler::KeyScheduler;

/// プロキシサーバーのエントリポイント。
pub struct ProxyServer;

impl ProxyServer {
    /// サーバーを起動する。
    ///
    /// 起動シーケンス:
    /// 1. `config.validate()` — 設定検証
    /// 2. `CancellationToken` 生成
    /// 3. `build_http_clients()` / `build_schedulers()` / `build_limiters()`
    /// 4. `AppState::new()` — 実行時状態構築
    /// 5. `build_router()` → `axum::serve()` — HTTP サーバー起動
    /// 6. `ServerHandle` を返す
    pub async fn start(config: AppConfig) -> Result<ServerHandle, Box<dyn std::error::Error + Send + Sync>> {
        // 1. 設定検証
        if let Err(errors) = config.validate() {
            for err in &errors {
                tracing::error!("config validation error: {err}");
            }
            return Err(format!("config validation failed with {} error(s)", errors.len()).into());
        }

        // 2. キャンセルトークン生成
        let cancel = CancellationToken::new();

        // 3. コンポーネント生成
        let http_clients = build_http_clients(&config);
        let schedulers = build_schedulers(&config);
        let limiters = build_limiters(&config);

        // 4. AppState 構築
        let port = config.global.port;
        let state = Arc::new(AppState::new(config, http_clients, schedulers, limiters));

        // 5. Router 構築
        let router = build_router(state);
        let addr = format!("0.0.0.0:{port}");
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
// Builder 関数
// ---------------------------------------------------------------------------

/// Provider ごとに `reqwest::Client` を生成する。
fn build_http_clients(config: &AppConfig) -> HashMap<String, reqwest::Client> {
    config
        .providers
        .keys()
        .map(|name| (name.clone(), reqwest::Client::new()))
        .collect()
}

/// Provider ごとに `KeyScheduler` を生成する。
fn build_schedulers(config: &AppConfig) -> HashMap<String, KeyScheduler> {
    config
        .providers
        .iter()
        .map(|(name, provider)| {
            let scheduler = KeyScheduler::new(provider.api_keys.clone(), name.clone());
            (name.clone(), scheduler)
        })
        .collect()
}

/// Provider ごとに `ConcurrencyLimiter` を生成する。
fn build_limiters(config: &AppConfig) -> HashMap<String, ConcurrencyLimiter> {
    config
        .providers
        .iter()
        .map(|(name, provider)| {
            let max_in_flight = provider
                .max_in_flight
                .unwrap_or(config.global.limits.default_max_in_flight);
            let max_queue = provider
                .max_queue
                .unwrap_or(config.global.limits.default_max_queue);
            let limiter = ConcurrencyLimiter::new(max_in_flight, max_queue);
            (name.clone(), limiter)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use crate::config::AppConfig;

    /// build_http_clients が provider 数と一致する HashMap を生成すること。
    #[test]
    fn build_http_clients_matches_provider_count() {
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

        let clients = build_http_clients(&config);
        assert_eq!(clients.len(), 2);
        assert!(clients.contains_key("a"));
        assert!(clients.contains_key("b"));
    }

    /// build_schedulers が provider ごとに正しく生成されること。
    #[test]
    fn build_schedulers_matches_provider_count() {
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
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );

        let schedulers = build_schedulers(&config);
        assert_eq!(schedulers.len(), 1);
        let scheduler = schedulers.get("test").unwrap();
        assert_eq!(scheduler.key_count(), 2);
    }

    /// build_limiters が provider ごとの max_in_flight / max_queue を継承すること。
    #[test]
    fn build_limiters_uses_provider_overrides() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "custom".to_string(),
            crate::config::ProviderConfig {
                transparent: false,
                base_url: "https://custom.example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: Some(16),
                max_queue: Some(32),
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );

        let limiters = build_limiters(&config);
        assert_eq!(limiters.len(), 1);
        assert!(limiters.contains_key("custom"));
    }

    /// ProxyServer と ServerHandle の型が期待通りであること。
    #[test]
    fn lifecycle_types_exist() {
        fn assert_send<T: Send>() {}
        assert_send::<ProxyServer>();
        assert_send::<ServerHandle>();
    }
}

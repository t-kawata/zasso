//! Proxy configuration and upstream endpoint constants.
//!
//! Contains [`ProxyConfig`] for loading environment-based configuration and
//! hardcoded primary/backup upstream URL constants.

use std::{env, sync::Arc};

use axum::http::StatusCode;
use tracing::info;

use super::upstream_router::{UpstreamRouter, UpstreamTarget};

/// Shared upstream router wrapped in an async mutex for concurrent handler access.
pub(crate) type SharedRouter = Arc<tokio::sync::Mutex<UpstreamRouter>>;

/// Primary `DashScope` upstream for Anthropic-protocol requests.
///
/// URL: `https://coding.dashscope.aliyuncs.com/apps/anthropic`
#[allow(dead_code)]
pub(crate) const PRIMARY_ANTHROPIC: &str = "https://coding.dashscope.aliyuncs.com/apps/anthropic";

/// Primary `DashScope` upstream for `OpenAI`-protocol requests.
///
/// URL: `https://coding.dashscope.aliyuncs.com/v1`
pub(crate) const PRIMARY_OPENAI: &str = "https://coding.dashscope.aliyuncs.com/v1";

/// Backup `TokenPlan` upstream for Anthropic-protocol requests.
///
/// URL: `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`
#[allow(dead_code)]
pub(crate) const BACKUP_ANTHROPIC: &str =
    "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic";

/// Backup `TokenPlan` upstream for `OpenAI`-protocol requests.
///
/// URL: `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
pub(crate) const BACKUP_OPENAI: &str =
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

/// Proxy server configuration loaded from environment variables.
///
/// Holds the upstream target URL, API keys for both the proxy itself and the
/// upstream provider, and an optional shared router for primary/backup failover.
///
/// # Environment Variables
///
/// - `PRIMARY_API_KEY` (or `UPSTREAM_API_KEY`) — API key for the primary upstream.
/// - `BACKUP_API_KEY` — API key for the backup upstream.
/// - `PROXY_API_KEY` — Optional key that clients must present to this proxy.
#[derive(Clone)]
pub(crate) struct ProxyConfig {
    /// Default upstream URL (used when no router is configured).
    pub(crate) upstream_url: String,
    /// API key sent to the upstream provider.
    pub(crate) upstream_api_key: String,
    /// Optional key that clients must present to this proxy.
    pub(crate) proxy_api_key: Option<String>,
    /// Shared router for primary/backup failover.
    pub(crate) router: Option<SharedRouter>,
}

impl ProxyConfig {
    /// Build a [`ProxyConfig`] from environment variables.
    ///
    /// Constructs primary and backup [`UpstreamTarget`]s, creates an
    /// [`UpstreamRouter`] wrapped in a shared mutex, and logs the resolved URLs.
    ///
    /// # Panics
    ///
    /// Panics if `PRIMARY_API_KEY` (or `UPSTREAM_API_KEY`) or `BACKUP_API_KEY`
    /// is not set in the environment.
    pub(crate) fn from_env() -> Self {
        // Each upstream line has its own secret key.
        let primary_api_key = env::var("PRIMARY_API_KEY")
            .or_else(|_| env::var("UPSTREAM_API_KEY"))
            .expect("PRIMARY_API_KEY (or UPSTREAM_API_KEY) must be set");
        let backup_api_key = env::var("BACKUP_API_KEY").expect("BACKUP_API_KEY must be set");
        let proxy_api_key = env::var("PROXY_API_KEY").ok();

        let primary_target = UpstreamTarget {
            name: "primary".to_string(),
            url: PRIMARY_OPENAI.trim_end_matches('/').to_string(),
            api_key: primary_api_key.clone(),
        };
        let backup_target = UpstreamTarget {
            name: "backup".to_string(),
            url: BACKUP_OPENAI.trim_end_matches('/').to_string(),
            api_key: backup_api_key,
        };

        info!(
            primary_url = &primary_target.url,
            backup_url = &backup_target.url,
            "starting http proxy with primary/backup routing"
        );

        let router = Some(Arc::new(tokio::sync::Mutex::new(UpstreamRouter::new(
            primary_target,
            Some(backup_target),
        ))));

        Self {
            upstream_url: PRIMARY_OPENAI.trim_end_matches('/').to_string(),
            upstream_api_key: primary_api_key,
            proxy_api_key,
            router,
        }
    }

    /// Get the active upstream target.
    ///
    /// Uses the router if available, otherwise falls back to the static config
    /// fields (`upstream_url`, `upstream_api_key`).
    pub(crate) async fn active_upstream(&self) -> UpstreamTarget {
        if let Some(ref router) = self.router {
            let guard = router.lock().await;
            guard.active_target().clone()
        } else {
            UpstreamTarget {
                name: "primary".to_string(),
                url: self.upstream_url.clone(),
                api_key: self.upstream_api_key.clone(),
            }
        }
    }

    /// Record an upstream response status for failover logic.
    ///
    /// Delegates to [`UpstreamRouter::record_response_status`] when a router is
    /// configured; otherwise this is a no-op.
    pub(crate) async fn record_upstream_status(&self, status: StatusCode) {
        if let Some(ref router) = self.router {
            let mut guard = router.lock().await;
            guard.record_response_status(status);
        }
    }

    /// Record an upstream connection/stream error for failover logic.
    ///
    /// Delegates to [`UpstreamRouter::record_connection_failure`] when a router
    /// is configured; otherwise this is a no-op.
    pub(crate) async fn record_upstream_error(&self) {
        if let Some(ref router) = self.router {
            let mut guard = router.lock().await;
            guard.record_connection_failure();
        }
    }
}

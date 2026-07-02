//! Axum router setup and health check loop.
//!
//! Creates the HTTP router with all endpoints and provides the background
//! health check loop for monitoring upstream availability.

use std::{sync::Arc, time::Duration};

use axum::{
    Router,
    routing::{get, post},
};
use tokio::sync::Mutex;
use tower_http::limit::RequestBodyLimitLayer;
use tracing::warn;

use crate::{
    config::ProxyConfig,
    handlers::{
        handle_anthropic_request, handle_health, handle_openai_request,
        handle_openai_responses_request,
    },
    upstream_router::UpstreamRouter,
};

/// Shared router type for concurrent access across async tasks.
pub(crate) type SharedRouter = Arc<Mutex<UpstreamRouter>>;

/// Create the Axum router with all endpoints and middleware.
pub(crate) fn create_router(config: ProxyConfig) -> Router {
    Router::new()
        .route("/v1/messages", post(handle_anthropic_request))
        .route("/v1/chat/completions", post(handle_openai_request))
        .route("/v1/responses", post(handle_openai_responses_request))
        .route("/health", get(handle_health))
        .layer(RequestBodyLimitLayer::new(16 * 1024 * 1024)) // 16 MB
        .with_state(config)
}

/// Periodic health check loop for the primary upstream.
///
/// Probes the primary URL every `interval` and marks it healthy/unhealthy
/// on the shared router. Only meaningful when a backup upstream is configured.
pub(crate) async fn health_check_loop(router: SharedRouter, interval: Duration) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(interval).await;

        // Tick cooldown timer (decrement by 1 minute per health check iteration).
        {
            let mut guard = router.lock().await;
            guard.tick_cooldown();
        }

        // Read the primary URL without holding the lock longer than necessary.
        let primary_url = {
            let guard = router.lock().await;
            guard.primary.url.clone()
        };

        match tokio::time::timeout(Duration::from_secs(10), client.get(&primary_url).send()).await {
            Ok(Ok(resp))
                if resp.status().is_success() || resp.status() == axum::http::StatusCode::OK =>
            {
                let mut guard = router.lock().await;
                guard.mark_primary_healthy();
            }
            Ok(Ok(resp)) => {
                // Got a response but non-2xx (e.g. 401 from API endpoint without key).
                // A bare GET to an API base typically returns 401/404 — that's still
                // "the server is up", so treat it as healthy.
                let status = resp.status();
                if status.is_client_error() || status.is_server_error() {
                    // Still reachable — mark healthy
                    let mut guard = router.lock().await;
                    guard.mark_primary_healthy();
                }
            }
            _ => {
                // Timeout or network error — primary is unreachable.
                warn!(%primary_url, "primary health check failed — unreachable");
                let mut guard = router.lock().await;
                guard.mark_primary_unhealthy();
            }
        }
    }
}

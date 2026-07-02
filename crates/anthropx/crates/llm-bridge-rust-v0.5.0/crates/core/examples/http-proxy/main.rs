//! HTTP proxy server example: Anthropic/`OpenAI` clients ↔ opposite upstream protocol
//! with primary/backup upstream routing and automatic failover.
//!
//! # Overview
//!
//! This example demonstrates a complete HTTP proxy that:
//! - Accepts Anthropic or `OpenAI` format requests from clients
//! - Automatically translates to the opposite format for upstream
//! - Routes between primary and backup upstreams with automatic failover
//! - Handles both streaming (SSE) and non-streaming requests
//!
//! # Upstream Configuration
//!
//! **Primary:** `DashScope` (`coding.dashscope.aliyuncs.com`)
//! - Anthropic: `/apps/anthropic`
//! - `OpenAI`: `/v1`
//!
//! **Backup:** `TokenPlan` (`token-plan.cn-beijing.maas.aliyuncs.com`)
//! - Anthropic: `/apps/anthropic`
//! - `OpenAI`: `/compatible-mode/v1`
//!
//! # Usage
//!
//! ```bash
//! # Set required environment variables
//! export PRIMARY_API_KEY=<dashscope-key>
//! export BACKUP_API_KEY=<tokenplan-key>
//! export PROXY_API_KEY=<proxy-key>  # optional
//!
//! # Run the proxy
//! cargo run --example http-proxy
//! ```
//!
//! Then point an Anthropic-compatible client at `http://localhost:3000/v1/messages`,
//! or an `OpenAI`-compatible client at `http://localhost:3000/v1/chat/completions`.

mod auth;
mod config;
mod handlers;
mod helpers;
mod router;
mod upstream_router;

use std::{env, time::Duration};

use config::ProxyConfig;
use router::{create_router, health_check_loop};
use tracing::{error, info};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_level(true)
        .init();

    let config = ProxyConfig::from_env();
    let listen = env::var("PROXY_LISTEN").unwrap_or_else(|_| "127.0.0.1:3000".to_string());

    // Spawn health check loop if backup upstream is configured.
    if let Some(ref router) = config.router {
        tokio::spawn(health_check_loop(router.clone(), Duration::from_mins(1)));
    }

    let app = create_router(config);

    let listener = match tokio::net::TcpListener::bind(&listen).await {
        Ok(l) => l,
        Err(e) => {
            error!(error = %e, listen, "failed to bind");
            panic!("failed to bind: {e}");
        }
    };

    info!(listen, "proxy listening");
    axum::serve(listener, app).await.expect("serve failed");
}

// Tests are kept in the original http-proxy.rs file for backward compatibility.
// They will be migrated to this module structure in a follow-up commit.

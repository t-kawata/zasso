//! Upstream routing and failover logic.
//!
//! Provides primary/backup upstream routing with automatic failover on 429 responses,
//! connection errors, and health check failures.

use std::sync::atomic::AtomicU64;

use axum::http::StatusCode;
use tracing::{info, warn};

/// Global counter for unique proxy request IDs.
pub(crate) static NEXT_PROXY_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

/// Represents an upstream API target.
#[derive(Debug, Clone)]
pub(crate) struct UpstreamTarget {
    pub(crate) name: String,
    pub(crate) url: String,
    pub(crate) api_key: String,
}

/// Which upstream route is currently active.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActiveRoute {
    Primary,
    Backup,
}

/// Manages primary/backup upstream routing with automatic failover.
///
/// Implements circuit-breaker-like behavior:
/// - Fails over on 429 (Too Many Requests) from primary
/// - Fails over after N consecutive connection errors
/// - Periodically health-checks primary and fails back when healthy
/// - Uses cooldown period to prevent ping-pong effect
#[derive(Debug, Clone)]
pub(crate) struct UpstreamRouter {
    pub(crate) primary: UpstreamTarget,
    backup: Option<UpstreamTarget>,
    active: ActiveRoute,
    primary_healthy: bool,
    /// Cooldown period (in minutes) before switching back to primary after failover.
    /// Prevents "ping-pong" effect where primary briefly recovers then fails again.
    cooldown_remaining: u64,
    /// Consecutive connection errors on the current active upstream.
    /// Resets on successful health check or response.
    connection_errors: u32,
}

/// Number of consecutive connection errors before failing over to backup
/// without waiting for HTTP health check confirmation.
const CONNECTION_ERROR_THRESHOLD: u32 = 3;

/// Cooldown period in minutes before failing back to primary.
const COOLDOWN_MINUTES: u64 = 5;

impl UpstreamRouter {
    /// Create a new router with primary and optional backup upstream.
    pub(crate) fn new(primary: UpstreamTarget, backup: Option<UpstreamTarget>) -> Self {
        let primary_healthy = backup.is_some(); // only track health if backup exists
        Self {
            primary,
            backup,
            active: ActiveRoute::Primary,
            primary_healthy,
            cooldown_remaining: 0,
            connection_errors: 0,
        }
    }

    /// Get the currently active upstream target.
    pub(crate) fn active_target(&self) -> &UpstreamTarget {
        match self.active {
            ActiveRoute::Primary => &self.primary,
            ActiveRoute::Backup => self.backup.as_ref().unwrap_or(&self.primary),
        }
    }

    /// Record an upstream response status. If primary returns 429 and backup exists,
    /// failover to backup.
    pub(crate) fn record_response_status(&mut self, status: StatusCode) {
        // Reset connection error counter on successful response
        self.connection_errors = 0;

        if status == StatusCode::TOO_MANY_REQUESTS
            && self.backup.is_some()
            && self.active == ActiveRoute::Primary
        {
            warn!("primary upstream returned 429 — failing over to backup");
            self.active = ActiveRoute::Backup;
            self.primary_healthy = false;
            self.cooldown_remaining = COOLDOWN_MINUTES;
        }
    }

    /// Mark primary as healthy and potentially fail back to it.
    pub(crate) fn mark_primary_healthy(&mut self) {
        if self.backup.is_none() {
            return;
        }
        // Only fail back to primary if cooldown period has elapsed
        if self.cooldown_remaining > 0 {
            return;
        }
        if !self.primary_healthy {
            info!("primary health check passed — failing back to primary");
            self.primary_healthy = true;
            self.active = ActiveRoute::Primary;
        }
        // Reset connection error counter — primary is confirmed healthy
        self.connection_errors = 0;
    }

    /// Mark primary as unhealthy and failover to backup.
    pub(crate) fn mark_primary_unhealthy(&mut self) {
        if self.backup.is_none() {
            return;
        }
        if self.active == ActiveRoute::Primary {
            warn!("primary health check failed — failing over to backup");
            self.active = ActiveRoute::Backup;
            self.cooldown_remaining = COOLDOWN_MINUTES;
        }
        self.primary_healthy = false;
    }

    /// Record a connection-level failure. Increments error counter; only failover
    /// when threshold is reached.
    pub(crate) fn record_connection_failure(&mut self) {
        if self.backup.is_none() {
            return;
        }
        self.connection_errors += 1;
        if self.connection_errors >= CONNECTION_ERROR_THRESHOLD
            && self.active == ActiveRoute::Primary
        {
            warn!(
                connection_errors = self.connection_errors,
                "primary connection errors exceeded threshold ({CONNECTION_ERROR_THRESHOLD}) — \
                 failing over to backup"
            );
            self.active = ActiveRoute::Backup;
            self.primary_healthy = false;
            self.cooldown_remaining = COOLDOWN_MINUTES;
        } else if self.active == ActiveRoute::Primary {
            warn!(
                connection_errors = self.connection_errors,
                "primary connection failed — monitoring (failover at {CONNECTION_ERROR_THRESHOLD} \
                 errors)"
            );
        }
    }

    /// Decrement cooldown timer. Call periodically (e.g. from health check loop).
    pub(crate) fn tick_cooldown(&mut self) {
        if self.cooldown_remaining > 0 {
            self.cooldown_remaining = self.cooldown_remaining.saturating_sub(1);
        }
    }

    /// Get the current active route (for testing).
    #[cfg(test)]
    pub(crate) fn active_route(&self) -> ActiveRoute {
        self.active
    }

    /// Check if primary is marked healthy (for testing).
    #[cfg(test)]
    pub(crate) fn is_primary_healthy(&self) -> bool {
        self.primary_healthy
    }
}

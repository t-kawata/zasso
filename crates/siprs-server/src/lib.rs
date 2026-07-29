// [::TICKET::] P2-2: siprs-server library entry for Tauri embedding.
// Axum JWT auth middleware types live here (axum dependency required).

// SPDX-License-Identifier: MIT OR Apache-2.0

/// Axum JWT authentication layer.
///
/// Intercepts incoming HTTP requests and validates the `Authorization:
/// Bearer <token>` header. Excluded routes: `/api/v1/health` and
/// `/api/v1/auth/token`.
///
/// The underlying JWT validation logic lives in the `siprs` crate
/// (`siprs::security::auth_jwt_middleware::JwtValidator`). This module
/// provides the Axum middleware wrapper only.
pub mod auth;

/// Axum route definitions (handler stubs).
///
// [::STUB::] P4-3: route handler module has stub functions only -- Implement all 18 REST endpoint handlers with Axum
pub mod routes;

/// WebSocket session management.
///
// [::STUB::] P4-3: WebSocket module has stub functions only -- Implement control WS handshake, event stream publishing, and audio binary frame handling
pub mod ws;

/// SQLite persistence with SeaORM.
///
// [::STUB::] P4-3: database module has no implementation -- Implement SeaORM pool setup, migration runner, and account persistence
pub mod db;

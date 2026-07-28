// [::TICKET::] P2-2: Axum JWT auth layer — validates Bearer tokens via siprs::JwtValidator.

// SPDX-License-Identifier: MIT OR Apache-2.0

use axum::http::StatusCode;
use siprs::security::auth_jwt_middleware::JwtValidator;

/// JWT auth middleware function.
///
/// [::STUB::] P4-3: Integrate with axum::middleware::from_fn_with_state.
/// The current implementation is a placeholder that compiles as a library
/// entry point. Full middleware wiring requires AppState and Router setup.
pub fn jwt_auth_layer(_validator: JwtValidator) -> &'static str {
    // [::STUB::] P4-3: Return axum::middleware::from_fn_with_state(state, auth_middleware)
    // once route handler stubs are replaced with real handlers.
    "jwt-auth-layer-stub"
}

/// Placeholder for the actual JWT auth middleware handler.
///
/// [::STUB::] P4-3: Implement async fn that extracts Bearer token,
/// validates via JwtValidator, and passes request to next middleware.
pub async fn validate_bearer_token() -> (StatusCode, &'static str) {
    // [::STUB::] P4-3: Full token extraction and validation
    (StatusCode::UNAUTHORIZED, "Authentication required")
}

// [::TICKET::] P2-2: Axum JWT auth layer — validates Bearer tokens via siprs::JwtValidator.

// SPDX-License-Identifier: MIT OR Apache-2.0

use axum::http::StatusCode;
use siprs::security::auth_jwt_middleware::JwtValidator;

/// JWT auth middleware function.
///
// [::STUB::] P4-3: jwt_auth_layer returns stub string -- Implement axum::middleware::from_fn_with_state wiring with AppState and Router
pub fn jwt_auth_layer(_validator: JwtValidator) -> &'static str {
    "jwt-auth-layer-stub"
}

/// Placeholder for the actual JWT auth middleware handler.
///
// [::STUB::] P4-3: validate_bearer_token returns hardcoded 401 -- Implement async fn with Bearer token extraction, JwtValidator validation, and next middleware pass-through
pub async fn validate_bearer_token() -> (StatusCode, &'static str) {
    (StatusCode::UNAUTHORIZED, "Authentication required")
}

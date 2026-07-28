// [::TICKET::] P2-2: Layer 5 API integration test — JWT auth flow.
// Tests: token issuance, validation, rejection of expired/malformed tokens.

use siprs_server::auth::axum_jwt_auth_layer;
use siprs::security::auth_jwt_middleware::JwtValidator;

// [::STUB::] P4-3: Full Axum TestResponse-based integration tests.
// Prerequisites: MockBackend (P1-3 N0053) + test Router with route handlers.

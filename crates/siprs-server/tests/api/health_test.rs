// [::TICKET::] P12-10: Layer 5 REST integration test — health check.
// GET /api/v1/health returns 200 with a MockBackend-backed status (C063).

#[path = "../common/harness.rs"]
mod common;

use axum::http::StatusCode;
use common::TestApp;
use siprs::api::http_ws_protocol::PATH_HEALTH;

#[tokio::test]
// [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
async fn test_health_returns_ok_without_auth() {
    let app = TestApp::new();

    let response = app.get(PATH_HEALTH).await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = common::body_json(response).await;
    assert_eq!(json["status"], "ok");
}

// [::TICKET::] P12-10: Layer 5 REST integration test — JWT auth flow (C064).
// Token issuance for valid SIP credentials, rejection of invalid credentials,
// and Bearer-token enforcement on protected routes in JWT mode.

#[path = "../common/harness.rs"]
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;
use siprs::api::http_ws_protocol::{PATH_ACCOUNTS, PATH_AUTH_TOKEN};

#[tokio::test]
async fn test_issue_token_for_valid_credentials() -> Result<(), Box<dyn std::error::Error>> {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::with_jwt("test-secret");
    app.seed_account("1001", "pbx.example.com", "secret").await;

    let response = app
        .post_json(
            PATH_AUTH_TOKEN,
            json!({
                "username": "1001",
                "domain": "pbx.example.com",
                "password": "secret",
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = common::body_json(response).await;
    let token = json["token"].as_str().ok_or("token is missing")?;
    assert!(!token.is_empty(), "issued JWT must be non-empty");
    Ok(())
}

#[tokio::test]
async fn test_issue_token_rejects_invalid_credentials() {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::with_jwt("test-secret");
    app.seed_account("1001", "pbx.example.com", "secret").await;

    let response = app
        .post_json(
            PATH_AUTH_TOKEN,
            json!({
                "username": "1001",
                "domain": "pbx.example.com",
                "password": "wrong-password",
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_protected_route_rejects_missing_bearer_in_jwt_mode() {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::with_jwt("test-secret");

    let response = app.get(PATH_ACCOUNTS).await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_protected_route_accepts_valid_bearer_in_jwt_mode(
) -> Result<(), Box<dyn std::error::Error>> {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::with_jwt("test-secret");
    app.seed_account("1001", "pbx.example.com", "secret").await;

    let token_response = app
        .post_json(
            PATH_AUTH_TOKEN,
            json!({
                "username": "1001",
                "domain": "pbx.example.com",
                "password": "secret",
            }),
        )
        .await;
    let token = common::body_json(token_response).await["token"]
        .as_str()
        .ok_or("token is missing")?
        .to_string();

    let response = app.get_auth(PATH_ACCOUNTS, &token).await;

    assert_eq!(response.status(), StatusCode::OK);
    Ok(())
}

#[tokio::test]
async fn test_localhost_only_mode_accepts_without_token() {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::new();

    let response = app.get(PATH_ACCOUNTS).await;

    assert_eq!(response.status(), StatusCode::OK);
}

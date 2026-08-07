// [::TICKET::] P12-10: Layer 5 REST integration test — account list/create
// round-trip through the Axum router against a MockBackend-backed AppState
// (C063/C064).

#[path = "../common/harness.rs"]
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;
use siprs::api::http_ws_protocol::PATH_ACCOUNTS;

#[tokio::test]
async fn test_account_create_and_list_round_trip() -> Result<(), Box<dyn std::error::Error>> {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::new();

    let create_response = app
        .post_json(
            PATH_ACCOUNTS,
            json!({
                "username": "2001",
                "domain": "pbx.example.com",
                "password": "s3cret",
            }),
        )
        .await;
    assert_eq!(create_response.status(), StatusCode::OK);
    let create_json = common::body_json(create_response).await;
    let created_id = create_json["id"].as_i64().ok_or("account id is missing")?;

    let list_response = app.get(PATH_ACCOUNTS).await;
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_json = common::body_json(list_response).await;
    let accounts = list_json["accounts"]
        .as_array()
        .ok_or("accounts array is missing")?;

    assert!(
        accounts
            .iter()
            .any(|account| account["id"].as_i64() == Some(created_id)),
        "created account id {} must appear in the list",
        created_id
    );
    assert!(
        accounts.iter().any(|account| account["username"] == "2001"),
        "created account username 2001 must appear in the list"
    );
    Ok(())
}

#[tokio::test]
async fn test_account_create_persists_in_mock_backend() {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::new();

    app.post_json(
        PATH_ACCOUNTS,
        json!({
            "username": "3001",
            "domain": "pbx.example.com",
            "password": "pw",
        }),
    )
    .await;

    let backend = app.state.backend.lock().await;
    assert!(
        backend
            .accounts
            .values()
            .any(|entry| entry.config.username == "3001"),
        "MockBackend must persist the created account"
    );
}

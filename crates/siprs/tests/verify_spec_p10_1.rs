// Layer 5 integration tests for the P10-1 account-info retrieval.
//
// These tests verify at the crate boundary that the public account-info surface
// reads the reactor's authoritative ClientState:
//   - SipAccountHandle::registration_state() returns the real RegistrationState
//     mapped from the AccountEntry stored by the AddAccount handler (no hardcoded Idle).
//   - The GetAccountInfo dispatch derives its AccountInfoSnapshot from the
//     MockBackend account registry (no canned sip:user{native}@mock.example.com).
//
// Contracts verified: C012 (query_state round-trip), C013 (NonZeroU64 AccountId),
// C017 (Result<T, SipError> on the public account-info surface), C026
// (registration independent of call ability).

use siprs::config::account_config_spec::AccountConfig;
use siprs::config::ClientConfig;
use siprs::model::AccountId;
use siprs::runtime::command::RuntimeCommand;
use siprs::state::RegistrationState;
use siprs::SipAccountHandle;
use siprs::SipClient;

/// Build the minimal ClientConfig the reactor accepts.
// [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
fn test_config() -> ClientConfig {
    ClientConfig::builder()
        .sip_proxy_host("sip.example.com")
        .build()
}

/// Register an account with the given username and hand back the client.
async fn client_with_registered_account(
    username: &str,
) -> Result<SipClient, Box<dyn std::error::Error>> {
    let config = test_config();
    let (client, _rx) = SipClient::new(config).await?;
    let account_config = AccountConfig {
        username: username.into(),
        ..Default::default()
    };
    let (_dummy_tx, _dummy_rx) = tokio::sync::oneshot::channel();
    client
        .handle()
        .submit(RuntimeCommand::AddAccount {
            config: account_config,
            reply: _dummy_tx,
        })
        .await?;
    Ok(client)
}

// ── Reactor round-trip: registration_state reads the AddAccount entry ──

#[tokio::test]
// [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
async fn registration_state_round_trips_added_account() -> Result<(), Box<dyn std::error::Error>> {
    // The AddAccount handler stores the entry in ClientState.accounts
    // (reactor.rs AddAccount arm) — registration_state() must observe it.
    let client = client_with_registered_account("alice").await?;
    let handle = SipAccountHandle::new(client.clone(), 1);
    assert_eq!(
        handle.registration_state().await?,
        RegistrationState::Registered,
        "registration_state must return the reactor's Registered state, not a hardcoded Idle"
    );
    client.shutdown().await?;
    Ok(())
}

// ── QueryState consistency: registration_state and accounts() agree ────

#[tokio::test]
// [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
async fn registration_state_and_accounts_query_agree() -> Result<(), Box<dyn std::error::Error>> {
    // Both SipClient::accounts() (query_state → account_snapshot_from_entry)
    // and SipAccountHandle::registration_state() read the same ClientState clone.
    let client = client_with_registered_account("alice").await?;
    let accounts = client.accounts().await?;
    assert_eq!(
        accounts.len(),
        1,
        "exactly one account after one AddAccount"
    );
    assert!(
        accounts[0].registered,
        "the stored Registered entry must be registered"
    );

    let handle = SipAccountHandle::new(client.clone(), 1);
    assert_eq!(
        handle.registration_state().await?,
        RegistrationState::Registered
    );

    client.shutdown().await?;
    Ok(())
}

// ── Integration point: query path crosses the public API → handle → reactor ──

#[tokio::test]
// [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
async fn registration_state_does_not_block_the_reactor() -> Result<(), Box<dyn std::error::Error>> {
    // registration_state() → RuntimeHandle::query_state() → DispatchCommand::QueryState
    // → reactor client_state.clone(). The query completes while the reactor stays alive.
    let client = client_with_registered_account("alice").await?;
    let handle = SipAccountHandle::new(client.clone(), 1);
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        handle.registration_state(),
    )
    .await;
    assert!(
        result.is_ok(),
        "registration_state must round-trip through the reactor without blocking"
    );
    assert!(
        !client.is_terminated(),
        "a read-only query must never terminate the reactor"
    );
    client.shutdown().await?;
    Ok(())
}

// ── GetAccountInfo dispatch derives the snapshot from the registry ─────

#[tokio::test]
// [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
async fn get_account_info_dispatch_derives_snapshot_from_registry(
) -> Result<(), Box<dyn std::error::Error>> {
    let client = client_with_registered_account("alice").await?;
    let snapshot = client.handle().submit_get_account_info(1).await?;
    assert_eq!(snapshot.acc_id, AccountId::from_u64(1)?);
    assert_eq!(
        snapshot.registration_status, 200,
        "Registered entry must derive registration_status=200"
    );
    assert_eq!(snapshot.registration_expires, Some(3600));
    assert!(snapshot.online_status);
    assert_eq!(
        snapshot.uri, "alice",
        "uri must be derived from the stored entry.config (the mock stores username)"
    );
    client.shutdown().await?;
    Ok(())
}

#[tokio::test]
// [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
async fn get_account_info_unknown_native_id_returns_error() -> Result<(), Box<dyn std::error::Error>>
{
    let client = client_with_registered_account("alice").await?;
    let result = client.handle().submit_get_account_info(99).await;
    assert!(
        result.is_err(),
        "GetAccountInfo for an unknown native id must return Err, not a canned snapshot"
    );
    client.shutdown().await?;
    Ok(())
}

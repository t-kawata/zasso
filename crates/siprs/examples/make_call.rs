
//! Example: Outgoing call with event-driven lifecycle.
//!
//! This example demonstrates how to place an outgoing SIP call, subscribe to
//! call events, and handle call lifecycle transitions (ringing, connected,
//! disconnected).
//!
//! Prerequisites:
//! - PJSIP development library installed on the system
//! - A registered SIP account (run account_register example first)
//! - A reachable SIP peer at the target URI
//!
//! Run: `cargo run --example make_call`
//!
//! [::STUB::] P1-3: This example references types from future tickets
//! (SipClient, AccountConfig, OutgoingCallRequest, SecretString,
//! SipEventPayload). It is gated behind the `spec-examples` feature in
//! Cargo.toml — remove the feature gate once all dependency types are
//! implemented (P0-7/P0-8+).

// [::TICKET::] P1-3: Usage Examples & Code Samples
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec`

use siprs::{AccountConfig, OutgoingCallRequest, SecretString, SipClient, SipEventPayload};

// ── SIP account constants ────────────────────────────────────────────────────

/// SIP username for the calling account.
const USERNAME: &str = "1001";

/// SIP password.
const PASSWORD: &str = "secret";

/// SIP domain.
const DOMAIN: &str = "pbx.example.com";

/// Target SIP URI to call.
const TARGET_URI: &str = "sip:1002@pbx.example.com";

/// Timeout for waiting for call connection.
const CONNECTION_TIMEOUT_SECS: u64 = 30;

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Create the client and add an account
    let client = SipClient::new(Default::default()).await?;
    let account = client
        .add_account(AccountConfig {
            username: USERNAME.into(),
            password: SecretString::new(PASSWORD.into()),
            domain: DOMAIN.into(),
            register_on_start: true,
            ..Default::default()
        })
        .await?;

    // 2. Subscribe to raw SIP messages (optional)
    if let Some(mut raw_rx) = client.subscribe_raw_sip() {
        tokio::spawn(async move {
            while let Ok(msg) = raw_rx.recv().await {
                tracing::debug!("Raw SIP: {}", msg.start_line);
            }
        });
    }

    // 3. Subscribe to account events
    let mut event_rx = client.subscribe_account(account.id());

    // 4. Place an outgoing call
    println!("Calling {} ...", TARGET_URI);
    let call_id = account
        .make_call(OutgoingCallRequest {
            target_uri: TARGET_URI.into(),
            ..Default::default()
        })
        .await?;

    println!("Call ID: {:?}", call_id);

    // 5. Receive events until connected or timeout
    let deadline =
        tokio::time::Instant::now() + std::time::Duration::from_secs(CONNECTION_TIMEOUT_SECS);

    loop {
        if tokio::time::Instant::now() >= deadline {
            println!("Timed out waiting for call connection.");
            break;
        }

        tokio::time::timeout_at(deadline, event_rx.recv()).await;

        match tokio::time::timeout_at(deadline, event_rx.recv()).await {
            Ok(Ok(event)) => match event.payload {
                SipEventPayload::OutgoingCallRinging(ref info) => {
                    println!("Ringing (status: {:?})", info.status_code);
                }
                SipEventPayload::CallConnected(_) => {
                    println!("Call connected!");
                    break;
                }
                SipEventPayload::CallRejected(ref rej) => {
                    println!("Call rejected (status: {})", rej.status_code);
                    break;
                }
                SipEventPayload::CallDisconnected(_) => {
                    println!("Call disconnected.");
                    break;
                }
                SipEventPayload::MediaActive(_) => {
                    println!("Media stream active.");
                }
                _ => {
                    tracing::debug!("Ignored event: {:?}", event.payload);
                }
            },
            Ok(Err(_)) => {
                println!("Event stream closed.");
                break;
            }
            Err(_) => {
                println!("Timed out waiting for call events.");
                break;
            }
        }
    }

    // 6. Hang up the call
    account.hangup(call_id, Default::default()).await?;
    println!("Call hung up.");

    Ok(())
}

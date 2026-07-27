
//! Example: Account registration with two-phase registration pattern.
//!
//! This example demonstrates how to add a SIP account, register it with a
//! registrar, subscribe to account events, and unregister on shutdown.
//!
//! Prerequisites:
//! - PJSIP development library installed on the system
//! - A running SIP registrar (e.g., PBX) at the configured domain
//!
//! Run: `cargo run --example account_register`
//!
//! [::STUB::] P1-3: This example references types from future tickets
//! (SipClient, AccountConfig, AccountTransportPolicy, DtmfPolicy,
//! SecretString, TransportKind). It is gated behind the `spec-examples`
//! feature in Cargo.toml — remove the feature gate once all dependency
//! types are implemented (P0-7/P0-8+).

// [::TICKET::] P1-3: Usage Examples & Code Samples
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec`

use siprs::{
    AccountConfig, AccountTransportPolicy, DtmfPolicy, SecretString, SipClient, TransportKind,
};

// ── SIP account constants ────────────────────────────────────────────────────

/// Display name for the SIP account.
const DISPLAY_NAME: &str = "Desk 01";

/// SIP username (extension number).
const USERNAME: &str = "1001";

/// SIP password (loaded from environment in production).
const PASSWORD: &str = "secret";

/// SIP domain / PBX address.
const DOMAIN: &str = "pbx.example.com";

/// Registrar URI (typically the same as the domain).
const REGISTRAR_URI: &str = "sip:pbx.example.com";

/// Registration expiration in seconds.
const REGISTRATION_EXPIRES_SECS: u64 = 300;

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Create the SIP client
    let client = SipClient::new(Default::default()).await?;

    // 2. Configure the SIP account with explicit registration
    let account = client
        .add_account(AccountConfig {
            display_name: Some(DISPLAY_NAME.into()),
            username: USERNAME.into(),
            auth_username: None,
            password: SecretString::new(PASSWORD.into()),
            domain: DOMAIN.into(),
            registrar_uri: Some(REGISTRAR_URI.into()),
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Prefer(TransportKind::Udp),
            register_on_start: false,
            allow_outbound_without_register: true,
            registration_expires: std::time::Duration::from_secs(REGISTRATION_EXPIRES_SECS),
            ..Default::default()
        })
        .await?;

    println!("Account {} added with ID: {:?}", USERNAME, account.id());

    // 3. Two-phase registration: explicit register call
    println!(
        "Registering account {} with registrar {} ...",
        USERNAME, REGISTRAR_URI
    );
    account.register().await?;
    println!("Registration initiated successfully.");

    // 4. Subscribe to account-specific events
    let mut event_rx = client.subscribe_account(account.id());
    tracing::info!("Listening for account events (registration status)");

    // 5. Wait briefly for registration confirmation (production would loop)
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Check for any pending registration events
    while let Ok(event) = event_rx.try_recv() {
        println!("Event received: {:?}", event.payload);
    }

    // 6. Unregister and clean up
    account.unregister().await?;
    println!("Account unregistered.");

    Ok(())
}

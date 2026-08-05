// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::STUB::] P1-3: Example binaries document the API surface; full CLI/PJSIP runtime is deferred -- Implement full example binaries (account_register, audio_tap, client_init, make_call, tts_source) with PJSIP backend, CLI args, and integration tests
// [::TICKET::] P0-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P8-2) --for-spec --no-implementation-order`.
use siprs::{AccountConfig, ClientConfig, SecretString, SipClient};

/// Account registration (RFC §41.2): construct an account, then register it.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ClientConfig::builder()
        .sip_proxy_host("sip.example.com")
        .sip_proxy_port(5060)
        .build();
    let (client, _events) = SipClient::new(config).await?;
    // The account carries its password as a SecretString; Display never leaks it.
    let _account_config = AccountConfig {
        username: "alice".into(),
        domain: "example.com".into(),
        password: SecretString::new("s3cret!"),
        ..AccountConfig::default()
    };
    client.shutdown().await?;
    Ok(())
}

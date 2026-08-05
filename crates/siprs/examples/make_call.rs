// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::STUB::] P1-3: Example binaries document the API surface; full CLI/PJSIP runtime is deferred -- Implement full example binaries (account_register, audio_tap, client_init, make_call, tts_source) with PJSIP backend, CLI args, and integration tests
// [::TICKET::] P0-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P8-2) --for-spec --no-implementation-order`.
use siprs::{CallMediaPreferences, ClientConfig, OutgoingCallRequest, SipClient};

/// Placing an outgoing call (RFC §41.3): build an `OutgoingCallRequest`, then dial.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ClientConfig::builder()
        .sip_proxy_host("sip.example.com")
        .sip_proxy_port(5060)
        .build();
    let (client, _events) = SipClient::new(config).await?;
    let _request = OutgoingCallRequest {
        target_uri: "sip:bob@example.com".into(),
        headers: Vec::new(),
        auth_override: None,
        preferred_transport: None,
        media: CallMediaPreferences::default(),
        auto_answer_refer: false,
    };
    client.shutdown().await?;
    Ok(())
}

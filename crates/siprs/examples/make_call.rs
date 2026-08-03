// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::STUB::] P1-3: example documents the make-call surface (P8-2 O-007); full CLI/PJSIP runtime still deferred -- Implement full make a call example with PJSIP backend, CLI args, and integration test
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

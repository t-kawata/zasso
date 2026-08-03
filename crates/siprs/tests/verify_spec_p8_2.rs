// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::TICKET::] P8-2: Observability, Security & Platform Configuration — ABC closure.
//
// This integration test closes the O-002 ABC inspection gap for the P8-2
// implementation:
//
//   O-002: SipClient::new never emitted ClientInitialized. The variant
//          SipEventPayload::ClientInitialized(ClientCapabilities) existed at
//          src/api/event_model_payload_bus.rs but SipClient::new (src/client.rs)
//          never published it, so the advertised "capabilities via
//          ClientInitialized event after new()" behavior was untested and
//          unimplemented. Here we assert the event actually arrives and carries
//          the ClientCapabilities defaults.
//
// See specs/P8-2.md §Contracts C047 for the contract mapping.

use siprs::{
    ClientConfig, SipClient, SipEventPayload,
};

/// O-002 — after SipClient::new succeeds, the returned receiver yields a
/// ClientInitialized event carrying ClientCapabilities defaults.
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
#[tokio::test]
async fn client_initialized_event_carries_capabilities() {
    let config = ClientConfig::builder()
        .sip_proxy_host("sip.example.com")
        .sip_proxy_port(5060)
        .build();
    let (_client, mut rx) = SipClient::new(config)
        .await
        .expect("SipClient::new with a valid config must succeed");

    // The reactor publishes nothing during Initialize, so ClientInitialized is
    // the first control event. Loop defensively in case future reactor behavior
    // adds earlier events, and tolerate Lagged on slow consumers.
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        let timeout = tokio::time::sleep_until(deadline);
        tokio::pin!(timeout);
        tokio::select! {
            _ = &mut timeout => panic!("ClientInitialized not emitted within 2s"),
            ev = rx.recv() => match ev {
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(e) => panic!("event channel closed: {e:?}"),
                Ok(ev) => match ev.payload {
                    SipEventPayload::ClientInitialized(caps) => {
                        assert_eq!(caps.event_bus_capacity, 2048,
                            "ClientCapabilities must advertise the event bus capacity");
                        assert_eq!(caps.max_calls, u32::MAX,
                            "ClientCapabilities must advertise no artificial call limit");
                        return;
                    }
                    other => {
                        // Not the event we are waiting for — keep consuming.
                        let _ = other;
                    }
                },
            },
        }
    }
}

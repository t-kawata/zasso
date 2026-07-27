//! Example: SIP client initialization with UDP/TCP transports and STUN.
//!
//! This example demonstrates how to create a `SipClient` with transport
//! configuration and STUN server discovery. It shows the minimum viable
//! configuration for using the siprs crate.
//!
//! Prerequisites:
//! - PJSIP development library installed on the system
//! - Network access to the configured STUN server (optional; init succeeds
//!   without STUN if stun_servers is empty)
//!
//! Run: `cargo run --example client_init`
//!
//! [::STUB::] P1-3: This example references types from future tickets
//! (SipClient, ClientConfig, TransportConfig, StunServerConfig). It is gated
//! behind the `spec-examples` feature in Cargo.toml — remove the feature gate
//! once all dependency types are implemented (P0-7/P0-8+).

// [::TICKET::] P1-3: Usage Examples & Code Samples
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec`

use siprs::{
    ClientConfig, SipClient, StunServerConfig, TransportConfig,
};

// ── Port and server constants ────────────────────────────────────────────────

/// Default SIP UDP port.
const UDP_PORT: u16 = 5060;

/// Default SIP TCP port.
const TCP_PORT: u16 = 5060;

/// Public Google STUN server for NAT discovery.
const STUN_SERVER_URI: &str = "stun:stun.l.google.com:19302";

/// Event bus capacity: 2048 events covers ~100 concurrent calls with margin.
const EVENT_BUS_CAPACITY: usize = 2048;

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create a minimal client config with UDP and TCP transports
    let _client = SipClient::new(ClientConfig {
        transports: vec![
            TransportConfig::udp(UDP_PORT),
            TransportConfig::tcp(TCP_PORT),
        ],
        stun_servers: vec![StunServerConfig {
            uri: STUN_SERVER_URI.into(),
        }],
        event_bus_capacity: EVENT_BUS_CAPACITY,
        ..Default::default()
    })
    .await?;

    tracing::info!("SIP client initialized successfully");
    println!("SIP client is ready. Use another example to add an account and place a call.");

    Ok(())
}

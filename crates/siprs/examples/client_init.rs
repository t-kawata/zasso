

// Client initialization (RFC §41.1): configure the SIP proxy/STUN from CLI
// args, construct the client, report its capabilities, then shut down.
//
// Run: cargo run --example client_init -- --host sip.example.com [--port 5060] [--stun stun:host:19302]

#[path = "common/cli.rs"]
mod cli;
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.

use std::io::Write;
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.

use siprs::SipEventPayload;
use siprs::SipClient;

use cli::build_client_config;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = cli::parse(std::env::args().skip(1))?;
    let config = build_client_config(&args);
    let (client, mut events) = SipClient::new(config).await?;
    report_capabilities(&mut events).await?;
    client.shutdown().await?;
    Ok(())
}

/// Await the ClientInitialized event and print the advertised capabilities.
async fn report_capabilities(
    events: &mut tokio::sync::broadcast::Receiver<siprs::SipEvent>,
) -> Result<(), Box<dyn std::error::Error>> {
    loop {
        match events.recv().await {
            Ok(event) => match event.payload {
                SipEventPayload::ClientInitialized(caps) => {
                    writeln!(
                        std::io::stdout(),
                        "client initialized: event_bus_capacity={} max_calls={}",
                        caps.event_bus_capacity, caps.max_calls
                    )?;
                    return Ok(());
                }
                _ => {}
            },
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(e) => return Err(format!("event channel closed: {e:?}").into()),
        }
    }
}

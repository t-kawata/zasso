// Placing an outgoing call (RFC §41.3): dial an OutgoingCallRequest from CLI
// args and wait for the ringing / connected / rejected events.
//
// Run: cargo run --example make_call -- --host sip.example.com --target sip:bob@example.com

#[path = "common/cli.rs"]
mod cli;
#[path = "common/client.rs"]
mod client;

use std::io::Write;

use siprs::model::AccountId;
use siprs::{
    CallMediaPreferences, Codec, OutgoingCallRequest, SipAccountHandle, SipClient, SipEventPayload,
};

use cli::build_client_config;
use client::add_account_and_resolve;

/// How long to wait for a call outcome before reporting a timeout.
const CALL_EVENT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = cli::parse(std::env::args().skip(1))?;
    client::require(&args, &["--target"])?;
    let config = build_client_config(&args);
    let (client, _events) = SipClient::new(config).await?;
    let account = add_account_and_resolve(&client, &args).await?;
    let request = build_call_request(&args)?;
    let call_id = account.make_call(request).await?;
    writeln!(std::io::stdout(), "call placed: call_id={call_id}")?;

    let mut account_events = client.subscribe_account(resolve_account_id(&account)?);
    let outcome = tokio::time::timeout(CALL_EVENT_TIMEOUT, await_call_events(&mut account_events))
        .await
        .map_err(|_| {
            "timed out waiting for call events (reactor NativeEvent dispatch pending P12-7)"
                .to_string()
        })??;

    match outcome {
        CallOutcome::Connected => {
            writeln!(std::io::stdout(), "call connected")?;
        }
        CallOutcome::Rejected(code, reason) => {
            return Err(format!("call rejected: {code} {reason}").into());
        }
    }
    client.shutdown().await?;
    Ok(())
}

/// Convert the account handle's raw id into the newtype expected by
/// `subscribe_account`.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn resolve_account_id(account: &SipAccountHandle) -> Result<AccountId, Box<dyn std::error::Error>> {
    AccountId::from_u64(account.id())
        .map_err(|e| format!("account id {} is invalid: {e}", account.id()).into())
}

/// Build the outgoing-call request from the CLI target URI.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn build_call_request(
    args: &cli::CliArgs,
) -> Result<OutgoingCallRequest, Box<dyn std::error::Error>> {
    let target_uri = args
        .target_uri
        .clone()
        .ok_or_else(|| format!("--target is required\n{}", cli::USAGE_TEMPLATE))?;
    Ok(OutgoingCallRequest {
        target_uri,
        headers: vec![],
        auth_override: None,
        preferred_transport: None,
        media: CallMediaPreferences {
            enable_early_media: true,
            enable_srtp: None,
            preferred_codecs: vec![Codec::Opus, Codec::Pcmu],
        },
        auto_answer_refer: false,
    })
}

/// The observable result of an outgoing call attempt.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
enum CallOutcome {
    Connected,
    Rejected(u16, String),
}

/// Await the call outcome, printing the ringing signal and skipping unrelated
/// events.
async fn await_call_events(
    events: &mut siprs::AccountEventReceiver,
) -> Result<CallOutcome, Box<dyn std::error::Error>> {
    loop {
        match events.recv().await {
            Ok(event) => match event.payload {
                SipEventPayload::OutgoingCallRinging => {
                    writeln!(std::io::stdout(), "ringing")?;
                }
                SipEventPayload::CallConnected(_) => return Ok(CallOutcome::Connected),
                SipEventPayload::CallRejected(rejection) => {
                    return Ok(CallOutcome::Rejected(
                        rejection.status_code,
                        rejection.reason,
                    ));
                }
                _ => {}
            },
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(e) => return Err(format!("event channel closed: {e:?}").into()),
        }
    }
}

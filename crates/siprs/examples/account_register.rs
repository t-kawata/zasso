// Account registration (RFC §41.2): add an account from CLI args and register
// it with the SIP proxy, exiting once registration completes or fails cleanly.
//
// Run: cargo run --example account_register -- --host sip.example.com --username alice --domain example.com --password s3cret!

#[path = "common/cli.rs"]
mod cli;
#[path = "common/client.rs"]
mod client;

use std::io::Write;

use siprs::model::AccountId;
use siprs::RegistrationState;
use siprs::SipAccountHandle;
use siprs::SipClient;
use siprs::SipEventPayload;

use cli::build_client_config;
use client::add_account_and_resolve;

/// How long to wait for a registration outcome before reporting a timeout.
const REGISTRATION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
// [::TICKET::] P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-4 --for-spec --no-implementation-order`.
// [::TICKET::] P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-4 --for-spec --no-implementation-order`.
// [::TICKET::] P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-4 --for-spec --no-implementation-order`.
    let args = cli::parse(std::env::args().skip(1))?;
    client::require(&args, &["--username", "--domain", "--password"])?;
    let config = build_client_config(&args);
    let (client, _events) = SipClient::new(config).await?;
    let account = add_account_and_resolve(&client, &args).await?;
    // P17-4 §62.24: subscribe before register() — the TestBackend fires the
    // registration event synchronously inside the SetRegistration arm, and a
    // broadcast receiver does not replay past events to new subscribers.
    let mut account_events = client.subscribe_account(resolve_account_id(&account)?);
    account.register().await?;

    let outcome = tokio::time::timeout(
        REGISTRATION_TIMEOUT,
        await_registration(&mut account_events),
    )
    .await
    .map_err(|_| {
        "timed out waiting for registration (reactor NativeEvent dispatch pending P12-7)"
            .to_string()
    })??;

    match outcome {
        RegistrationOutcome::Succeeded => {
            writeln!(std::io::stdout(), "registration succeeded")?;
        }
        RegistrationOutcome::Failed(reason) => {
            return Err(format!("registration failed: {reason}").into());
        }
    }
    client.shutdown().await?;
    Ok(())
}

/// Convert the account handle's raw id into the newtype expected by
/// `subscribe_account`. A non-zero id always converts; a zero id is invalid
/// by the newtype contract and surfaces as an error.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn resolve_account_id(account: &SipAccountHandle) -> Result<AccountId, Box<dyn std::error::Error>> {
    AccountId::from_u64(account.id())
        .map_err(|e| format!("account id {} is invalid: {e}", account.id()).into())
}

/// The observable result of a registration attempt.
// [::TICKET::] P9-1, P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-1|P16-3) --for-spec --no-implementation-order`.
enum RegistrationOutcome {
    Succeeded,
    Failed(String),
}

/// Await the registration outcome, skipping unrelated events.
///
/// §62.12 (P16-3): registration results are notified solely through the unified
/// `RegistrationStateChanged` event — the old `RegistrationSucceeded` /
/// `RegistrationFailed` variants were removed from `SipEventPayload`.
async fn await_registration(
    events: &mut siprs::AccountEventReceiver,
) -> Result<RegistrationOutcome, Box<dyn std::error::Error>> {
    loop {
        match events.recv().await {
            Ok(event) => match event.payload {
                SipEventPayload::RegistrationStateChanged(RegistrationState::Registered) => {
                    return Ok(RegistrationOutcome::Succeeded);
                }
                SipEventPayload::RegistrationStateChanged(RegistrationState::Failed) => {
                    return Ok(RegistrationOutcome::Failed(
                        "registration failed (see server log for details)".into(),
                    ));
                }
                _ => {}
            },
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(e) => return Err(format!("event channel closed: {e:?}").into()),
        }
    }
}

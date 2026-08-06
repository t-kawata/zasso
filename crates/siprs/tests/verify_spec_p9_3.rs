// [::TICKET::] P9-3: Layer 2 integration tests for SipCall & Call lifecycle.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
//
// These tests verify that the public `SipCall` domain type (RFC §19, N0027)
// exposes a typed call lifecycle that agrees with the RFC §18 state machine and
// that it can be moved across tokio tasks (Send + Sync) alongside the event
// model types (contracts C028, C049).

use siprs::api::call_api_semantics::CallApiSemantics;
use siprs::call::{HangupReason, SipCall};
use siprs::config::account_config_spec::DtmfMethod;
use siprs::model::{AccountId, CallId};
use siprs::state::call_state_model::CallState;
use siprs::state::m20_callstate_mapping::CallMediaState;

/// Build a call fixture in the given signalling state.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn sip_call(state: CallState) -> Result<SipCall, Box<dyn std::error::Error>> {
    Ok(SipCall::new(
        AccountId::from_u64(1)?,
        CallId::from_u64(1)?,
        state,
        CallMediaState::Active,
    ))
}

// ── C028: SipCall lifecycle agrees with the RFC §18 transition table ─────

/// @verifies C028
#[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn lifecycle_transitions_match_callstate_table() -> Result<(), Box<dyn std::error::Error>> {
    let mut call = sip_call(CallState::Incoming)?;
    call.answer(200)?;
    // RFC §18: Incoming → Connecting is the only legal edge from Incoming.
    assert_eq!(call.call_state(), CallState::Connecting);
    assert!(CallState::Incoming
        .transition(CallState::Connecting)
        .is_ok());
    Ok(())
}

// ── C028: answer() on a non-incoming call propagates InvalidState ───────

/// @verifies C028
#[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn answer_non_incoming_propagates_invalid_state() -> Result<(), Box<dyn std::error::Error>> {
    let mut call = sip_call(CallState::Active)?;
    let err = call.answer(200).expect_err("answer on Active must fail");
    assert_eq!(err.kind, siprs::SipErrorKind::InvalidState);
    Ok(())
}

// ── C049: blind transfer records the target URI ─────────────────────────

/// @verifies C049
#[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn blind_transfer_records_target_uri() -> Result<(), Box<dyn std::error::Error>> {
    let mut call = sip_call(CallState::Active)?;
    call.transfer("sip:carol@example.com".to_string())?;
    assert_eq!(call.state(), CallState::Transferring);
    assert_eq!(call.transfer_target(), Some("sip:carol@example.com"));
    Ok(())
}

// ── C028: SipCall is Send + Sync and usable across tokio tasks ──────────

/// @verifies C028
#[tokio::test]
async fn sip_call_is_send_and_movable_across_tasks() -> Result<(), Box<dyn std::error::Error>> {
    let call = sip_call(CallState::Incoming)?;
    let moved = tokio::spawn(async move {
        // Move the call into another task; the state must survive the move.
        call.state()
    })
    .await?;
    assert_eq!(moved, CallState::Incoming);
    Ok(())
}

// ── C028: hangup from Active lands in Disconnecting per the state table ─

/// @verifies C028
#[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn hangup_active_lands_in_disconnecting() -> Result<(), Box<dyn std::error::Error>> {
    let mut call = sip_call(CallState::Active)?;
    call.hangup(HangupReason::LocalUser)?;
    assert_eq!(call.state(), CallState::Disconnecting);
    // Active → Disconnecting is a valid RFC §18 edge.
    assert!(CallState::Active
        .transition(CallState::Disconnecting)
        .is_ok());
    Ok(())
}

// ── C028: send_dtmf accepts valid DTMF on an active call ────────────────

/// @verifies C028
#[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn send_dtmf_active_accepts_valid_digits() -> Result<(), Box<dyn std::error::Error>> {
    let mut call = sip_call(CallState::Active)?;
    assert!(call.send_dtmf("123#", DtmfMethod::Rfc4733).is_ok());
    Ok(())
}

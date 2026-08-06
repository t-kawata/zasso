//! P8-3 — ID Design, Event Model & State Machines — ABC closure integration tests.
//!
//! O-001 — C026 invariant "Registration independent of call ability":
//! `make_call()` is always permitted regardless of registration state. The
//! invariant is enforced at the type level by asserting the *signature* of
//! `make_call()` (src/api/public_api_design.rs) accepts an
//! `OutgoingCallRequest` and does not reference `RegistrationState` at all.
//!
//! The complementary compile-time check — that every `RegistrationState`
//! variant is a data-free unit variant — lives in the unit test module of
//! src/state/registr_state_machine.rs (`registration_state_variants_are_unit_variants`).

use std::path::PathBuf;

/// Read the `make_call` signature from src/api/public_api_design.rs.
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
fn make_call_signature() -> Result<String, Box<dyn std::error::Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/api/public_api_design.rs");
    let source = std::fs::read_to_string(&path)?;
    let make_call = source
        .split("pub async fn make_call")
        .nth(1)
        .ok_or("make_call must be declared in public_api_design.rs")?;
    let signature = make_call
        .split('{')
        .next()
        .ok_or("make_call must have a signature followed by a body")?;
    Ok(signature.to_string())
}

/// O-001 — `make_call()` accepts `OutgoingCallRequest` and never references
/// `RegistrationState` in its signature. If a future change couples the call
/// API to registration state, this test fails red.
#[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
fn make_call_signature_independent_of_registration_state() -> Result<(), Box<dyn std::error::Error>>
{
    let signature = make_call_signature()?;

    assert!(
        signature.contains("OutgoingCallRequest"),
        "make_call must accept OutgoingCallRequest, got: {signature}"
    );
    assert!(
        !signature.contains("RegistrationState"),
        "make_call must not reference RegistrationState, got: {signature}"
    );
    Ok(())
}

/// O-001 — the parameter list of `make_call` contains exactly the request
/// parameter (plus `&self`); it must not gain a registration-state parameter.
#[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
fn make_call_parameter_list_has_no_registration_state() -> Result<(), Box<dyn std::error::Error>> {
    let signature = make_call_signature()?;
    let params = signature
        .split_once('(')
        .map(|(_, rest)| rest)
        .ok_or("make_call signature must contain a parameter list")?;

    assert!(
        !params.contains("RegistrationState"),
        "make_call parameter list must not contain RegistrationState, got: {params}"
    );
    Ok(())
}

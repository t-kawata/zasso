//! O-004 — separate-crate verification that `SipEventPayload` is `#[non_exhaustive]`.
//!
//! `#[non_exhaustive]` is only observable from *outside* the defining crate. This
//! integration test compiles as a separate crate against the `siprs` public API,
//! so the compiler cannot enumerate all `SipEventPayload` variants and therefore
//! requires the trailing wildcard arm.
//!
//! The `#![deny(unreachable_patterns)]` lint makes the verification airtight:
//!
//! - With `#[non_exhaustive]` present — the wildcard `_` arm is reachable (the
//!   compiler assumes unknown future variants), so the test compiles.
//! - If `#[non_exhaustive]` is removed — every variant is covered by the specific
//!   arms above, so the `_` arm becomes unreachable and the `deny` turns it into a
//!   hard build error.
//!
//! Closing ABC omission O-004: the in-crate test `sip_event_payload_is_non_exhaustive`
//! (src/api/event_model_payload_bus.rs) only asserts `Clone` and cannot observe the
//! attribute; this separate crate can.

#![deny(unreachable_patterns)]

use siprs::SipEventPayload;

#[test]
// [::TICKET::] P8-3, P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-3|P16-3) --for-spec --no-implementation-order`.
fn sip_event_payload_matches_with_wildcard_arm() {
    // Construct one payload to drive the exhaustive match below.
    let payload = SipEventPayload::OutgoingCallStarted;

    // Every current variant is matched explicitly; the wildcard arm is required
    // ONLY because the enum is #[non_exhaustive].
    match payload {
        SipEventPayload::RegistrationStarted(_) => {}
        SipEventPayload::UnregistrationSucceeded => {}
        SipEventPayload::UnregistrationFailed(_) => {}
        SipEventPayload::RegistrationExpired => {}
        SipEventPayload::RegistrationStateChanged(_) => {}
        SipEventPayload::OutgoingCallStarted => {}
        SipEventPayload::OutgoingCallTrying => {}
        SipEventPayload::OutgoingCallRinging => {}
        SipEventPayload::CallConnected(_) => {}
        SipEventPayload::CallDisconnected => {}
        SipEventPayload::CallHeld => {}
        SipEventPayload::MediaActive(_) => {}
        SipEventPayload::MediaError(_) => {}
        SipEventPayload::DtmfSent(_) => {}
        SipEventPayload::DtmfReceived(_) => {}
        SipEventPayload::EarlyMediaReceived(_) => {}
        SipEventPayload::IncomingCall(_) => {}
        SipEventPayload::CallCancelled(_) => {}
        SipEventPayload::CallRejected(_) => {}
        SipEventPayload::CallResumed => {}
        SipEventPayload::ReferReceived(_) => {}
        SipEventPayload::TransferCompleted(_) => {}
        SipEventPayload::MediaStopped(_) => {}
        SipEventPayload::IceNegotiationStarted => {}
        SipEventPayload::IceNegotiationSucceeded(_) => {}
        SipEventPayload::IceNegotiationFailed(_) => {}
        SipEventPayload::TransportConnected(_) => {}
        SipEventPayload::TransportDisconnected(_) => {}
        SipEventPayload::TransportError(_) => {}
        SipEventPayload::AccountAdded(_) => {}
        SipEventPayload::AccountRemoved(_) => {}
        SipEventPayload::AccountConfigChanged(_) => {}
        SipEventPayload::ClientInitialized(_) => {}
        SipEventPayload::ClientShutdown => {}
        SipEventPayload::Error(_) => {}
        _ => {} // reachable only while the enum remains #[non_exhaustive]
    }
}

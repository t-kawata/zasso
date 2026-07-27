// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0021:  §15 M20 NativeEvent to SipEventPayload Conversion
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0021 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! NativeEvent enum and its conversion to `SipEventPayload`.
//!
//! ## Design
//!
//! [`NativeEvent`] represents PJSIP callback events in a Rust-native form. The
//! [`convert_native_event_to_payload`] function matches each variant and maps
//! it to the corresponding [`SipEventPayload`], following the priority map
//! defined in RFC §15:
//!
//! | Priority | Variants | Action |
//! |----------|----------|--------|
//! | P0 | RegistrationStarted, CallStateChanged, CallMediaStateChanged, DtmfDigit | Map to `Some(SipEventPayload)` |
//! | P1 | TransportStateChanged, IceTransportError | Explicitly `None` (future) |
//! | P2 | CallTsxStateChanged, CallRedirected, CallTransferStatus, CallReplaced, NatDetected | Explicitly `None` (raw SIP bus) |
//!
//! P1/P2 events are excluded because they expose internal PJSIP transaction
//! details at a granularity finer than the crate's public API. Consumers that
//! need them can subscribe to the raw SIP bus via `EventBus::subscribe_raw_sip()`.
//!
//! ## Invariant: exhaustive match
//!
//! The `match` in `convert_native_event_to_payload` is written without a
//! wildcard arm. Adding a new variant to `NativeEvent` will cause a compile
//! error until a conversion arm is added, guaranteeing that every variant is
//! explicitly handled.

// [::STUB::] P0-7: NativeEvent and its conversion function are design-time
// contracts. They trigger dead_code until the runtime module (P0-7) produces
// NativeEvent instances from PJSIP callbacks.
#![allow(dead_code)]

use crate::api::event_model_payload_bus::SipEventPayload;
use crate::concurrency_contexts::command_serialization::AccountId;
use crate::concurrency_contexts::command_serialization::CallId;
use crate::state::m20_callstate_mapping::convert_call_media_state;
use crate::state::m20_callstate_mapping::convert_call_state;

// ---------------------------------------------------------------------------
// NativeEvent
// ---------------------------------------------------------------------------

/// All possible PJSIP callback events, aggregated into a Rust enum.
///
/// Each variant carries the data payload that PJSIP provides in its callback.
/// Variants are grouped by priority level per the RFC §1a priority map (P0/P1/P2).
///
/// This enum is `#[non_exhaustive]` so that adding new variants in future
/// releases is not a breaking change for downstream pattern matches.
///
/// ## Priority levels
///
/// - **P0** — Required for integration tests. Registration, Call, DTMF.
/// - **P1** — Operational observability. Transport, ICE.
/// - **P2** — Supplementary info. Transaction details, redirects, NAT detection.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub(crate) enum NativeEvent {
    // ── P0: Registration ──
    /// PJSIP `on_reg_state2()` callback — registration state changed.
    RegistrationStateChanged { acc_id: AccountId },
    /// PJSIP `on_reg_started()` callback — registration attempt started.
    RegistrationStarted { acc_id: AccountId, renew: bool },

    // ── P0: Call ──
    /// PJSIP `on_call_state()` callback — invite session state changed.
    CallStateChanged { call_id: CallId, state: i32 },
    /// PJSIP `on_call_media_state()` callback — media state changed.
    CallMediaStateChanged { call_id: CallId },

    // ── P0: DTMF ──
    /// PJSIP `on_dtmf_digit()` callback — DTMF digit received.
    DtmfDigit { call_id: CallId, digit: char },

    // ── P1: Transport / ICE ──
    /// PJSIP `on_transport_state()` callback — transport state changed.
    TransportStateChanged { transport_id: i32, state: i32 },
    /// PJSIP `on_ice_transport_error()` callback — ICE transport error.
    IceTransportError,

    // ── P2: Supplementary info ──
    /// PJSIP `on_call_tsx_state()` callback — transaction state changed.
    CallTsxStateChanged,
    /// PJSIP `on_call_redirected()` callback — call was redirected.
    CallRedirected,
    /// PJSIP `on_call_transfer_status()` callback — transfer status update.
    CallTransferStatus,
    /// PJSIP `on_call_replaced()` callback — call was replaced.
    CallReplaced,
    /// PJSIP NAT detection result.
    NatDetected,
}

// ---------------------------------------------------------------------------
// convert_native_event_to_payload
// ---------------------------------------------------------------------------

/// Converts a [`NativeEvent`] to the corresponding [`SipEventPayload`].
///
/// Returns `Some(SipEventPayload)` for P0-priority events that are within the
/// scope of this ticket. Returns `None` for P1/P2 events.
///
/// # Arguments
///
/// * `event` — The native PJSIP event to convert.
/// * `media_status` — The current call media status (pjsua_call_media_status)
///   from the PJSIP callback, used when converting `CallMediaStateChanged`.
///   Ignored (can be `0`) for all other event types.
pub(crate) fn convert_native_event_to_payload(
    event: NativeEvent,
    media_status: i32,
) -> Option<SipEventPayload> {
    match event {
        // ── P0: Registration ──
        NativeEvent::RegistrationStateChanged { .. } => {
            // Requires GetAccountInfo RuntimeCommand to resolve registration
            // status. Without a backend, we cannot determine success/failure.
            // [::STUB::] P0-6: Wire GetAccountInfo once the backend is available.
            None
        }
        NativeEvent::RegistrationStarted { .. } => Some(SipEventPayload::RegistrationStarted),

        // ── P0: Call ──
        NativeEvent::CallStateChanged { call_id: _, state } => {
            // Delegate to the specialized call state converter.
            convert_call_state(state, None)
        }
        NativeEvent::CallMediaStateChanged { call_id: _ } => {
            // Delegate to the specialized media state converter.
            convert_call_media_state(media_status)
        }

        // ── P0: DTMF ──
        NativeEvent::DtmfDigit {
            call_id: _,
            digit: _,
        } => Some(SipEventPayload::DtmfReceived),

        // ── P1: Transport / ICE ──
        // Explicitly excluded from P0 scope. Consumers may access via raw SIP bus.
        NativeEvent::TransportStateChanged { .. } | NativeEvent::IceTransportError => None,

        // ── P2: Supplementary info ──
        // Explicitly excluded — these expose internal PJSIP transaction details
        // at a granularity finer than the crate's public API.
        NativeEvent::CallTsxStateChanged
        | NativeEvent::CallRedirected
        | NativeEvent::CallTransferStatus
        | NativeEvent::CallReplaced
        | NativeEvent::NatDetected => None,
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use crate::model::id_design_newtype::AccountId;
    use crate::model::id_design_newtype::CallId;
    use super::*;
    use crate::api::event_model_payload_bus::SipEventPayload;

    // -----------------------------------------------------------------------
    // ── C022-precondition: NativeEvent enum constructible ─────────────────
    // -----------------------------------------------------------------------

    /// @verifies C022-precondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn native_event_is_debug_and_clone_and_partial_eq() {
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        assert_debug::<NativeEvent>();
        assert_clone::<NativeEvent>();
        assert_partial_eq::<NativeEvent>();
    }

    /// @verifies C022-precondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn native_event_is_non_exhaustive() {
        let doc = include_str!("m20_native_event_conv.rs");
        assert!(
            doc.contains("#[non_exhaustive]"),
            "NativeEvent must be annotated with #[non_exhaustive]"
        );
    }

    /// @verifies C022-precondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn native_event_all_p0_variants_constructible() {
        let _ = NativeEvent::RegistrationStateChanged { acc_id: AccountId::from_u64(1).unwrap() };
        let _ = NativeEvent::RegistrationStarted {
            acc_id: AccountId::from_u64(1).unwrap(),
            renew: false,
        };
        let _ = NativeEvent::CallStateChanged {
            call_id: CallId::from_u64(1).unwrap(),
            state: 0,
        };
        let _ = NativeEvent::CallMediaStateChanged { call_id: CallId::from_u64(1).unwrap() };
        let _ = NativeEvent::DtmfDigit {
            call_id: CallId::from_u64(1).unwrap(),
            digit: '1',
        };
    }

    /// @verifies C022-precondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn native_event_all_p1_p2_variants_constructible() {
        let _ = NativeEvent::TransportStateChanged {
            transport_id: 0,
            state: 0,
        };
        let _ = NativeEvent::IceTransportError;
        let _ = NativeEvent::CallTsxStateChanged;
        let _ = NativeEvent::CallRedirected;
        let _ = NativeEvent::CallTransferStatus;
        let _ = NativeEvent::CallReplaced;
        let _ = NativeEvent::NatDetected;
    }

    // -----------------------------------------------------------------------
    // ── C022-postcondition: P0 NativeEvent → Some(SipEventPayload) ──────
    // -----------------------------------------------------------------------

    /// @verifies C022-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn convert_function_signature_exists() {
        let _ = convert_native_event_to_payload as fn(NativeEvent, i32) -> Option<SipEventPayload>;
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn registration_started_converts_to_registration_started() {
        let event = NativeEvent::RegistrationStarted {
            acc_id: AccountId::from_u64(1).unwrap(),
            renew: false,
        };
        let result = convert_native_event_to_payload(event, 0);
        assert_eq!(result, Some(SipEventPayload::RegistrationStarted));
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn call_state_changed_calling_converts_to_outgoing_call_started() {
        let event = NativeEvent::CallStateChanged {
            call_id: CallId::from_u64(1).unwrap(),
            state: 1,
        };
        let result = convert_native_event_to_payload(event, 0);
        assert_eq!(result, Some(SipEventPayload::OutgoingCallStarted));
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn call_state_changed_confirmed_converts_to_call_connected() {
        let event = NativeEvent::CallStateChanged {
            call_id: CallId::from_u64(1).unwrap(),
            state: 3,
        };
        let result = convert_native_event_to_payload(event, 0);
        assert_eq!(result, Some(SipEventPayload::CallConnected));
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn call_state_changed_disconnected_converts_to_call_disconnected() {
        let event = NativeEvent::CallStateChanged {
            call_id: CallId::from_u64(1).unwrap(),
            state: 4,
        };
        let result = convert_native_event_to_payload(event, 0);
        assert_eq!(result, Some(SipEventPayload::CallDisconnected));
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn call_media_state_changed_active_converts_to_media_active() {
        let event = NativeEvent::CallMediaStateChanged { call_id: CallId::from_u64(1).unwrap() };
        let result = convert_native_event_to_payload(event, 1);
        assert_eq!(result, Some(SipEventPayload::MediaActive));
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn dtmf_digit_converts_to_dtmf_received() {
        let event = NativeEvent::DtmfDigit {
            call_id: CallId::from_u64(1).unwrap(),
            digit: '5',
        };
        let result = convert_native_event_to_payload(event, 0);
        assert_eq!(result, Some(SipEventPayload::DtmfReceived));
    }

    // -----------------------------------------------------------------------
    // ── C022-invariant: P1/P2 events return None ─────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn transport_state_changed_returns_none() {
        let event = NativeEvent::TransportStateChanged {
            transport_id: 0,
            state: 0,
        };
        assert!(convert_native_event_to_payload(event, 0).is_none());
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn ice_transport_error_returns_none() {
        assert!(convert_native_event_to_payload(NativeEvent::IceTransportError, 0).is_none());
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn call_tsx_state_changed_returns_none() {
        assert!(convert_native_event_to_payload(NativeEvent::CallTsxStateChanged, 0).is_none());
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn call_redirected_returns_none() {
        assert!(convert_native_event_to_payload(NativeEvent::CallRedirected, 0).is_none());
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn call_transfer_status_returns_none() {
        assert!(convert_native_event_to_payload(NativeEvent::CallTransferStatus, 0).is_none());
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn call_replaced_returns_none() {
        assert!(convert_native_event_to_payload(NativeEvent::CallReplaced, 0).is_none());
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn nat_detected_returns_none() {
        assert!(convert_native_event_to_payload(NativeEvent::NatDetected, 0).is_none());
    }

    // -----------------------------------------------------------------------
    // ── C022-invariant: SipEventPayload variants constructible ──────────
    // -----------------------------------------------------------------------

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn all_registration_variants_constructible() {
        let _ = SipEventPayload::RegistrationStarted;
        let _ = SipEventPayload::RegistrationSucceeded;
        let _ = SipEventPayload::RegistrationFailed;
        let _ = SipEventPayload::UnregistrationSucceeded;
        let _ = SipEventPayload::UnregistrationFailed;
        let _ = SipEventPayload::RegistrationExpired;
    }

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn all_dtmf_variants_constructible() {
        let _ = SipEventPayload::DtmfSent;
        let _ = SipEventPayload::DtmfReceived;
    }

    // -----------------------------------------------------------------------
    // ── RegistrationStateChanged: requires backend (C024 related) ────────
    // -----------------------------------------------------------------------

    /// @verifies C024-invariant
    #[test]
// [::TICKET::] P0-6, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P4-1) --for-spec --no-implementation-order`.
    fn registration_state_changed_returns_none_without_backend() {
        // Without a backend, RegistrationStateChanged cannot resolve the
        // registration status via GetAccountInfo. This is expected behavior
        // until the backend is wired in.
        let event = NativeEvent::RegistrationStateChanged { acc_id: AccountId::from_u64(1).unwrap() };
        assert!(convert_native_event_to_payload(event, 0).is_none());
    }
}

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.

// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0022:  §15 M20 CallState & CallMediaState Mapping
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0022 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// ============================================================================
//
// [::TICKET::] P0-5: CallState & CallMediaState mapping from PJSIP native types

use crate::api::event_model_payload_bus::{CallId, SipEventPayload};

// ── CallState (canonical definition in call_state_model.rs) ─────────────

/// Re-export the canonical 13-state `CallState` from `call_state_model`.
pub use crate::state::call_state_model::CallState;

// ── CallMediaState ──────────────────────────────────────────────────────

/// Media state for a call, mapped from PJSIP's `pjsua_call_media_status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallMediaState {
    /// Media is active (send/receive).
    Active,
    /// Call is held locally or remotely.
    Held,
    /// Media error occurred.
    Error,
}

/// Previous call direction, used to discriminate CONNECTING → Trying vs Ringing.
// [::STUB::] P3-2: CallDirection enum not yet consumed by Reactor -- Wire CallDirection into on_incoming_call FFI callback to discriminate Trying vs Ringing
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CallDirection {
    Outgoing,
    Incoming,
}

// ── PJSIP native state constants ────────────────────────────────────────

/// Raw pjsip_inv_state values (0-4).
/// [::TICKET::] P3-2: ffi::bindings provides PJSUA_CALL_NULL..PJSUA_CALL_DISCONNECTED.
// [::STUB::] P4-2: pjsip_inv_state constants duplicated from ffi::bindings stubs -- Remove and import from bindgen-generated pjsua.h constants
pub mod pjsip_inv_state {
    pub const NULL: u32 = 0;
    pub const CALLING: u32 = 1;
    pub const CONNECTING: u32 = 2;
    pub const CONFIRMED: u32 = 3;
    pub const DISCONNECTED: u32 = 4;
}

/// Raw pjsua_call_media_status values.
/// [::TICKET::] P3-2: ffi::bindings provides PJSUA call state constants.
// [::STUB::] P4-2: pjsua_call_media_status constants duplicated from ffi::bindings stubs -- Remove and import from bindgen-generated pjsua.h media status constants
pub mod pjsua_call_media_status {
    pub const NONE: u32 = 0;
    pub const ACTIVE: u32 = 1;
    pub const LOCAL_HOLD: u32 = 2;
    pub const REMOTE_HOLD: u32 = 3;
    pub const ERROR: u32 = 4;
}

// ── Conversion functions ────────────────────────────────────────────────

/// Convert a raw `pjsip_inv_state` to an optional `SipEventPayload`.
///
/// Returns `None` for `NULL` (initial state — no event to publish).
/// CONNECTING requires context: use `convert_call_state_with_previous()`
/// to discriminate Trying vs Ringing.
pub fn convert_call_state(call_id: CallId, state: u32) -> Option<SipEventPayload> {
    match state {
        pjsip_inv_state::NULL => None,
        pjsip_inv_state::CALLING => Some(SipEventPayload::OutgoingCallStarted),
        pjsip_inv_state::CONNECTING => {
            // Without context, default to Trying (outgoing assumption).
            Some(SipEventPayload::OutgoingCallTrying)
        }
        pjsip_inv_state::CONFIRMED => Some(SipEventPayload::CallConnected(
            crate::api::event_model_payload_bus::ConnectedCallInfo {
                call_id,
                // [::STUB::] P5-1: account_id hardcoded to NonZeroU64(1) -- Replace with actual account_id from CallEntry context
                account_id: crate::api::event_model_payload_bus::AccountId::from_u64(1)
                    .expect("NonZeroU64::new(1) should never fail"),
                remote_uri: String::new(),
            },
        )),
        pjsip_inv_state::DISCONNECTED => Some(SipEventPayload::CallDisconnected),
        _ => None,
    }
}

/// Convert a raw `pjsip_inv_state` with call direction context.
///
/// When `state == CONNECTING`:
/// - `CallDirection::Outgoing` → `OutgoingCallTrying`
/// - `CallDirection::Incoming` → `OutgoingCallRinging`
// [::STUB::] P3-2: convert_call_state_with_previous not yet called by Reactor -- Wire into Reactor call processing once FFI callback bridge delivers CallDirection
#[allow(dead_code)]
pub(crate) fn convert_call_state_with_previous(
    _call_id: CallId,
    state: u32,
    direction: CallDirection,
) -> Option<SipEventPayload> {
    match state {
        pjsip_inv_state::CONNECTING => match direction {
            CallDirection::Outgoing => Some(SipEventPayload::OutgoingCallTrying),
            CallDirection::Incoming => Some(SipEventPayload::OutgoingCallRinging),
        },
        _ => convert_call_state(_call_id, state),
    }
}

/// Convert a raw `pjsua_call_media_status` to an optional `SipEventPayload`.
pub fn convert_call_media_state(call_id: CallId, media_status: u32) -> Option<SipEventPayload> {
    match media_status {
        pjsua_call_media_status::NONE => None,
        pjsua_call_media_status::ACTIVE => Some(SipEventPayload::MediaActive(
            crate::api::event_model_payload_bus::MediaActiveInfo { call_id },
        )),
        pjsua_call_media_status::LOCAL_HOLD | pjsua_call_media_status::REMOTE_HOLD => {
            Some(SipEventPayload::CallHeld)
        }
        pjsua_call_media_status::ERROR => Some(SipEventPayload::MediaError(
            crate::api::event_model_payload_bus::MediaErrorInfo {
                call_id,
                reason: None,
            },
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── CallState conversion (all 5 inv_state values) ──────────────────

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_null_returns_none() {
        let result = convert_call_state(CallId::from_u64(1).unwrap(), pjsip_inv_state::NULL);
        assert!(result.is_none());
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_calling_returns_ougoing_call_started() {
        let result = convert_call_state(CallId::from_u64(1).unwrap(), pjsip_inv_state::CALLING);
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallStarted)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_connecting_defaults_to_trying() {
        let result = convert_call_state(CallId::from_u64(1).unwrap(), pjsip_inv_state::CONNECTING);
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallTrying)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_connecting_outgoing_direction() {
        let result = convert_call_state_with_previous(
            CallId::from_u64(1).unwrap(),
            pjsip_inv_state::CONNECTING,
            CallDirection::Outgoing,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallTrying)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_connecting_incoming_direction() {
        let result = convert_call_state_with_previous(
            CallId::from_u64(1).unwrap(),
            pjsip_inv_state::CONNECTING,
            CallDirection::Incoming,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallRinging)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_confirmed_returns_call_connected() {
        let result = convert_call_state(CallId::from_u64(1).unwrap(), pjsip_inv_state::CONFIRMED);
        assert!(matches!(result, Some(SipEventPayload::CallConnected(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_disconnected_returns_call_disconnected() {
        let result =
            convert_call_state(CallId::from_u64(1).unwrap(), pjsip_inv_state::DISCONNECTED);
        assert!(matches!(result, Some(SipEventPayload::CallDisconnected)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn inv_state_unknown_returns_none() {
        let result = convert_call_state(CallId::from_u64(1).unwrap(), 99); // invalid value
        assert!(result.is_none());
    }

    // ── CallMediaState conversion ──────────────────────────────────────

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_state_none_returns_none() {
        let result =
            convert_call_media_state(CallId::from_u64(1).unwrap(), pjsua_call_media_status::NONE);
        assert!(result.is_none());
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_state_active_returns_media_active() {
        let result = convert_call_media_state(
            CallId::from_u64(1).unwrap(),
            pjsua_call_media_status::ACTIVE,
        );
        assert!(matches!(result, Some(SipEventPayload::MediaActive(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_state_local_hold_returns_call_held() {
        let result = convert_call_media_state(
            CallId::from_u64(1).unwrap(),
            pjsua_call_media_status::LOCAL_HOLD,
        );
        assert!(matches!(result, Some(SipEventPayload::CallHeld)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_state_remote_hold_returns_call_held() {
        let result = convert_call_media_state(
            CallId::from_u64(1).unwrap(),
            pjsua_call_media_status::REMOTE_HOLD,
        );
        assert!(matches!(result, Some(SipEventPayload::CallHeld)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_state_error_returns_media_error() {
        let result =
            convert_call_media_state(CallId::from_u64(1).unwrap(), pjsua_call_media_status::ERROR);
        assert!(matches!(result, Some(SipEventPayload::MediaError(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_state_unknown_returns_none() {
        let result = convert_call_media_state(CallId::from_u64(1).unwrap(), 99); // invalid value
        assert!(result.is_none());
    }

    // ── CallState enum ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn call_state_variants_are_distinct() {
        assert_ne!(CallState::New as u8, CallState::Calling as u8);
        assert_ne!(CallState::Calling as u8, CallState::Trying as u8);
        assert_ne!(CallState::Trying as u8, CallState::Ringing as u8);
        assert_ne!(CallState::Ringing as u8, CallState::Active as u8);
        assert_ne!(CallState::Active as u8, CallState::Disconnecting as u8);
    }

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn call_state_debug_formatting() {
        assert!(!format!("{:?}", CallState::Active).is_empty());
    }

    // ── CallMediaState enum ───────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn call_media_state_variants() {
        assert_ne!(CallMediaState::Active as u8, CallMediaState::Held as u8);
        assert_ne!(CallMediaState::Held as u8, CallMediaState::Error as u8);
    }

    // ── CallDirection ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn call_direction_variants() {
        assert_ne!(CallDirection::Outgoing as u8, CallDirection::Incoming as u8);
    }

    // ── Invariant: exhaustive match (all 5 values) ─────────────────────

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn all_five_inv_state_values_covered() {
        // Verify all 5 pjsip_inv_state values [0..5) are handled without panic.
        for raw in 0u32..5 {
            let _ = convert_call_state(CallId::from_u64(1).unwrap(), raw);
        }
    }

    // ── Invariant: Clone + Debug ──────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn call_state_types_clone_and_debug() {
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_cd<T: Clone + std::fmt::Debug>() {}
        assert_cd::<CallState>();
        assert_cd::<CallMediaState>();
        assert_cd::<CallDirection>();
    }

    // ── const values ───────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn pjsip_inv_state_constants_match_rfc() {
        assert_eq!(pjsip_inv_state::NULL, 0);
        assert_eq!(pjsip_inv_state::CALLING, 1);
        assert_eq!(pjsip_inv_state::CONNECTING, 2);
        assert_eq!(pjsip_inv_state::CONFIRMED, 3);
        assert_eq!(pjsip_inv_state::DISCONNECTED, 4);
    }

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn pjsua_call_media_status_constants_match_rfc() {
        assert_eq!(pjsua_call_media_status::NONE, 0);
        assert_eq!(pjsua_call_media_status::ACTIVE, 1);
        assert_eq!(pjsua_call_media_status::LOCAL_HOLD, 2);
        assert_eq!(pjsua_call_media_status::REMOTE_HOLD, 3);
        assert_eq!(pjsua_call_media_status::ERROR, 4);
    }
}

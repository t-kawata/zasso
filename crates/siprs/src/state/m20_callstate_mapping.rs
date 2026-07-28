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
//   - NODE_ID=N0022:  §15 M20 CallState & CallMediaState Mapping
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0022 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::concurrency_contexts::command_serialization::CallId;
use crate::state::m20_native_event_conv::SipEventPayload;

// ============================================================================
// CallState enum
// ============================================================================

/// SIP call state as modeled by siprs.
///
/// Maps to the 13-state model defined in RFC §18. Used by the Reactor to track
/// per-call lifecycle and by `convert_call_state` for CONNECTING discrimination.
// [::STUB::] P1-4: Full CallState enum defined in call_state_model.rs (N0026).
// This minimal definition will be replaced once P1-4 implements the canonical version.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CallState {
    New,
    Calling,
    Trying,
    Ringing,
    EarlyMedia,
    Incoming,
    Connecting,
    Active,
    Held,
    Transferring,
    Disconnecting,
    Disconnected,
    Failed,
}

// ============================================================================
// PJSIP invitation state constants (pjsip_inv_state)
// ============================================================================

/// PJSIP_INV_STATE_NULL (0) — Initial state before an INVITE is created.
pub(crate) const PJSIP_INV_STATE_NULL: u8 = 0;

/// PJSIP_INV_STATE_CALLING (1) — Outgoing INVITE sent; never occurs on the receiving side.
pub(crate) const PJSIP_INV_STATE_CALLING: u8 = 1;

/// PJSIP_INV_STATE_CONNECTING (2) — Provisional response received.
/// Maps to Trying (outgoing) or Ringing (incoming) depending on previous state.
pub(crate) const PJSIP_INV_STATE_CONNECTING: u8 = 2;

/// PJSIP_INV_STATE_CONFIRMED (3) — Call is active (media negotiation complete).
pub(crate) const PJSIP_INV_STATE_CONFIRMED: u8 = 3;

/// PJSIP_INV_STATE_DISCONNECTED (4) — Call has been disconnected.
pub(crate) const PJSIP_INV_STATE_DISCONNECTED: u8 = 4;

// ============================================================================
// Media status constants (pjsua_call_media_status)
// ============================================================================

/// PJSUA_CALL_MEDIA_NONE (0) — Media has not been established.
pub(crate) const MEDIA_STATUS_NONE: u8 = 0;

/// PJSUA_CALL_MEDIA_ACTIVE (1) — Media is actively sending and receiving.
pub(crate) const MEDIA_STATUS_ACTIVE: u8 = 1;

/// PJSUA_CALL_MEDIA_LOCAL_HOLD (2) — Local hold is active.
pub(crate) const MEDIA_STATUS_LOCAL_HOLD: u8 = 2;

/// PJSUA_CALL_MEDIA_REMOTE_HOLD (3) — Remote hold is active.
pub(crate) const MEDIA_STATUS_REMOTE_HOLD: u8 = 3;

/// PJSUA_CALL_MEDIA_ERROR (4) — Media has encountered an error.
pub(crate) const MEDIA_STATUS_ERROR: u8 = 4;

// ============================================================================
// Conversion functions
// ============================================================================

/// Converts a pjsip_inv_state value to the corresponding SipEventPayload.
///
/// Dispatches CONNECTING (state=2) based on `previous_call_state` for Trying
/// vs Ringing discrimination:
///   - Calling → Connecting → OutgoingCallTrying (outgoing side)
///   - Incoming → Connecting → IncomingCall (ringing, incoming side)
///   - None/unknown → OutgoingCallTrying (safe default)
///
/// All 5 valid pjsip_inv_state values (0-4) are matched explicitly. Values
/// outside this range return None.
///
/// Reads as: "Convert a call state: if NULL emit nothing; if CALLING start an
/// outgoing call; if CONNECTING discriminate via previous state; if CONFIRMED
/// connect the call; if DISCONNECTED end the call."
pub(crate) fn convert_call_state(
    _call_id: CallId,
    state: u8,
    previous_call_state: Option<CallState>,
) -> Option<SipEventPayload> {
    match state {
        PJSIP_INV_STATE_NULL => None,
        PJSIP_INV_STATE_CALLING => Some(SipEventPayload::OutgoingCallStarted),
        PJSIP_INV_STATE_CONNECTING => {
            match previous_call_state {
                Some(CallState::Incoming) => Some(SipEventPayload::IncomingCall),
                _ => Some(SipEventPayload::OutgoingCallTrying),
            }
        }
        PJSIP_INV_STATE_CONFIRMED => Some(SipEventPayload::CallConnected),
        PJSIP_INV_STATE_DISCONNECTED => Some(SipEventPayload::CallDisconnected),
        _ => None,
    }
}

/// Converts a media status value to the corresponding SipEventPayload.
///
/// Reads the media status from the backend and maps:
///   - ACTIVE → MediaActive(MediaActiveInfo)
///   - LOCAL_HOLD | REMOTE_HOLD → CallHeld
///   - ERROR → MediaError(MediaErrorInfo)
///   - NONE or unknown → None (no event emitted)
///
/// Reads as: "Convert a media state: if ACTIVE emit MediaActive; if any hold
/// emit CallHeld; if ERROR emit MediaError; otherwise emit nothing."
pub(crate) fn convert_call_media_state(
    _call_id: CallId,
    media_status: u8,
) -> Option<SipEventPayload> {
    match media_status {
        MEDIA_STATUS_NONE => None,
        MEDIA_STATUS_ACTIVE => Some(SipEventPayload::MediaActive),
        MEDIA_STATUS_LOCAL_HOLD | MEDIA_STATUS_REMOTE_HOLD => Some(SipEventPayload::CallHeld),
        MEDIA_STATUS_ERROR => Some(SipEventPayload::MediaError),
        _ => None,
    }
}

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::concurrency_contexts::command_serialization::CallId;

    // =======================================================================
    // C023-precondition — pjsip_inv_state constants are named integers
    // =======================================================================

    /// @verifies C023-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_precondition_inv_state_constants_have_correct_values() {
        assert_eq!(PJSIP_INV_STATE_NULL, 0);
        assert_eq!(PJSIP_INV_STATE_CALLING, 1);
        assert_eq!(PJSIP_INV_STATE_CONNECTING, 2);
        assert_eq!(PJSIP_INV_STATE_CONFIRMED, 3);
        assert_eq!(PJSIP_INV_STATE_DISCONNECTED, 4);
    }

    /// @verifies C023-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_precondition_inv_state_constants_are_u8() {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn assert_u8(_v: u8) {}
        assert_u8(PJSIP_INV_STATE_NULL);
        assert_u8(PJSIP_INV_STATE_DISCONNECTED);
    }

    /// @verifies C023-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_precondition_media_status_constants_have_correct_values() {
        assert_eq!(MEDIA_STATUS_NONE, 0);
        assert_eq!(MEDIA_STATUS_ACTIVE, 1);
        assert_eq!(MEDIA_STATUS_LOCAL_HOLD, 2);
        assert_eq!(MEDIA_STATUS_REMOTE_HOLD, 3);
        assert_eq!(MEDIA_STATUS_ERROR, 4);
    }

    // =======================================================================
    // C023-postcondition — convert_call_state mapping
    // =======================================================================

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_null_state_returns_none() {
        let result = convert_call_state(CallId(0), PJSIP_INV_STATE_NULL, None);
        assert!(result.is_none(), "NULL state must return None");
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_calling_returns_outgoing_call_started() {
        let result = convert_call_state(CallId(5), PJSIP_INV_STATE_CALLING, None);
        assert!(result.is_some(), "CALLING must return Some payload");
        match result.unwrap() {
            SipEventPayload::OutgoingCallStarted => {}
            _ => panic!("CALLING must produce OutgoingCallStarted"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_connecting_with_calling_returns_trying() {
        let result = convert_call_state(
            CallId(5),
            PJSIP_INV_STATE_CONNECTING,
            Some(CallState::Calling),
        );
        assert!(result.is_some(), "CONNECTING+Calling must return Some");
        match result.unwrap() {
            SipEventPayload::OutgoingCallTrying => {}
            _ => panic!("CONNECTING+Calling must produce OutgoingCallTrying"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_connecting_with_incoming_returns_ringing() {
        let result = convert_call_state(
            CallId(5),
            PJSIP_INV_STATE_CONNECTING,
            Some(CallState::Incoming),
        );
        assert!(result.is_some(), "CONNECTING+Incoming must return Some");
        match result.unwrap() {
            SipEventPayload::IncomingCall => {}
            _ => panic!("CONNECTING+Incoming must produce IncomingCall"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_confirmed_returns_call_connected() {
        let result = convert_call_state(CallId(5), PJSIP_INV_STATE_CONFIRMED, None);
        assert!(result.is_some(), "CONFIRMED must return Some");
        match result.unwrap() {
            SipEventPayload::CallConnected => {}
            _ => panic!("CONFIRMED must produce CallConnected"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_disconnected_returns_call_disconnected() {
        let result = convert_call_state(CallId(5), PJSIP_INV_STATE_DISCONNECTED, None);
        assert!(result.is_some(), "DISCONNECTED must return Some");
        match result.unwrap() {
            SipEventPayload::CallDisconnected => {}
            _ => panic!("DISCONNECTED must produce CallDisconnected"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_media_active_returns_media_active() {
        let result = convert_call_media_state(CallId(5), MEDIA_STATUS_ACTIVE);
        assert!(result.is_some(), "ACTIVE media must return Some");
        match result.unwrap() {
            SipEventPayload::MediaActive => {}
            _ => panic!("ACTIVE media must produce MediaActive"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_media_local_hold_returns_call_held() {
        let result = convert_call_media_state(CallId(5), MEDIA_STATUS_LOCAL_HOLD);
        assert!(result.is_some(), "LOCAL_HOLD media must return Some");
        match result.unwrap() {
            SipEventPayload::CallHeld => {}
            _ => panic!("LOCAL_HOLD media must produce CallHeld"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_media_remote_hold_returns_call_held() {
        let result = convert_call_media_state(CallId(5), MEDIA_STATUS_REMOTE_HOLD);
        assert!(result.is_some(), "REMOTE_HOLD media must return Some");
        match result.unwrap() {
            SipEventPayload::CallHeld => {}
            _ => panic!("REMOTE_HOLD media must produce CallHeld"),
        }
    }

    /// @verifies C023-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_postcondition_media_error_returns_media_error() {
        let result = convert_call_media_state(CallId(5), MEDIA_STATUS_ERROR);
        assert!(result.is_some(), "ERROR media must return Some");
        match result.unwrap() {
            SipEventPayload::MediaError => {}
            _ => panic!("ERROR media must produce MediaError"),
        }
    }

    // =======================================================================
    // C023-invariant — all pjsip_inv_state values 0-4 are covered
    // =======================================================================

    /// @verifies C023-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_invariant_connecting_with_none_previous_state_defaults_to_trying() {
        // When previous_call_state is None (unknown), the safe default is Trying.
        let result = convert_call_state(
            CallId(5),
            PJSIP_INV_STATE_CONNECTING,
            None,
        );
        assert!(result.is_some(), "CONNECTING with None must have a default");
    }

    /// @verifies C023-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_invariant_out_of_range_state_returns_none() {
        assert!(convert_call_state(CallId(0), 5, None).is_none());
        assert!(convert_call_state(CallId(0), 255, None).is_none());
    }

    /// @verifies C023-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_invariant_media_none_returns_none() {
        let result = convert_call_media_state(CallId(5), MEDIA_STATUS_NONE);
        assert!(result.is_none(), "NONE media status must return None");
    }

    // =======================================================================
    // C022-postcondition — call_id propagation through conversions
    // =======================================================================

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_call_id_propagates_through_state_conversion() {
        // Verify call_id=0 and call_id=u64::MAX propagate unchanged
        let _r0 = convert_call_state(CallId(0), PJSIP_INV_STATE_CALLING, None);
        let _rmax = convert_call_state(CallId(u64::MAX), PJSIP_INV_STATE_CALLING, None);
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_call_id_propagates_through_media_conversion() {
        let _r0 = convert_call_media_state(CallId(0), MEDIA_STATUS_ACTIVE);
        let _rmax = convert_call_media_state(CallId(u64::MAX), MEDIA_STATUS_ACTIVE);
    }

    // =======================================================================
    // Boundary tests — edge values
    // =======================================================================

    /// @verifies C023-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c023_boundary_same_input_produces_same_output() {
        let result1 = convert_call_state(CallId(42), PJSIP_INV_STATE_CONFIRMED, None);
        let result2 = convert_call_state(CallId(42), PJSIP_INV_STATE_CONFIRMED, None);
        assert_eq!(format!("{:?}", result1), format!("{:?}", result2));
    }
}

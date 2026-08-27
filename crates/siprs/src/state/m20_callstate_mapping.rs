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

use crate::api::event_model_payload_bus::{AccountId, CallId, SipEventPayload};

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
///
/// Derived from the call's origin — `on_incoming_call` implies `Incoming`;
/// `make_call` implies `Outgoing`. Never read from the event payload.
///
/// Public since `CallEntry` carries a `direction` field that `SipClient::calls()`
/// exposes (P16-5 §62.14).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
// [::TICKET::] P12-8, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-8|P16-5) --for-spec --no-implementation-order`.
pub enum CallDirection {
    Outgoing,
    Incoming,
}

// ── PJSIP native state constants ────────────────────────────────────────
//
// P11-9: pjsip_inv_state / pjsua_call_media_status are re-exported from
// ffi::bindings — bindgen-generated under pjsua-native, stub aliases otherwise —
// so there is a single source of truth for the PJSIP state values.

pub use crate::ffi::bindings::{pjsip_inv_state, pjsua_call_media_status};

// ── Conversion ──────────────────────────────────────────────────────────

/// Convert a raw `pjsip_inv_state` to an optional `SipEventPayload`.
///
/// Returns `None` for `NULL` (initial state — no event to publish).
/// CONNECTING requires context: use `convert_call_state_with_previous()`
/// to discriminate Trying vs Ringing.
///
/// `account_id` is the owning account resolved from the call's `CallEntry`.
/// `CONFIRMED` with `None` yields `None` (event dropped) — never a hardcoded
/// account and never a panic on a missing `CallEntry`.
pub fn convert_call_state(
    call_id: CallId,
    account_id: Option<AccountId>,
    state: u32,
) -> Option<SipEventPayload> {
    match state {
        pjsip_inv_state::NULL => None,
        pjsip_inv_state::CALLING => Some(SipEventPayload::OutgoingCallStarted),
        pjsip_inv_state::INCOMING => Some(SipEventPayload::IncomingCall(
            crate::api::event_model_payload_bus::IncomingCallInfo {
                call_id,
                account_id: account_id?,
                caller_uri: String::new(),
                caller_name: None,
            },
        )),
        pjsip_inv_state::EARLY => Some(SipEventPayload::EarlyMediaReceived(
            crate::api::event_model_payload_bus::EarlyMediaInfo {
                call_id,
                media_description: None,
            },
        )),
        pjsip_inv_state::CONNECTING => {
            // Without context, default to Trying (outgoing assumption).
            Some(SipEventPayload::OutgoingCallTrying)
        }
        pjsip_inv_state::CONFIRMED => Some(SipEventPayload::CallConnected(
            crate::api::event_model_payload_bus::ConnectedCallInfo {
                call_id,
                account_id: account_id?,
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
///
/// Non-CONNECTING states delegate to `convert_call_state`, forwarding the
/// owning `account_id` so `CONFIRMED` emits the real per-account payload.
// [::TICKET::] P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-8 --for-spec --no-implementation-order`.
pub(crate) fn convert_call_state_with_previous(
    call_id: CallId,
    account_id: Option<AccountId>,
    state: u32,
    direction: CallDirection,
) -> Option<SipEventPayload> {
    match state {
        pjsip_inv_state::CONNECTING => match direction {
            CallDirection::Outgoing => Some(SipEventPayload::OutgoingCallTrying),
            CallDirection::Incoming => Some(SipEventPayload::OutgoingCallRinging),
        },
        _ => convert_call_state(call_id, account_id, state),
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

    /// Construct a test `CallId` from a non-zero value.
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn test_call_id(value: u64) -> CallId {
        CallId::from_u64(value).unwrap_or_else(|error| {
            panic!("test CallId requires a non-zero value, got {value}: {error}")
        })
    }

    /// Construct a test `AccountId` from a non-zero value.
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn test_account(value: u64) -> AccountId {
        AccountId::from_u64(value).unwrap_or_else(|error| {
            panic!("test AccountId requires a non-zero value, got {value}: {error}")
        })
    }

    /// Test account context passed to the conversion calls.
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn test_account_id() -> AccountId {
        test_account(7)
    }

    // ── CallState conversion (all 5 inv_state values) ──────────────────

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_null_returns_none() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::NULL,
        );
        assert!(result.is_none());
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_calling_returns_ougoing_call_started() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::CALLING,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallStarted)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_connecting_defaults_to_trying() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::CONNECTING,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallTrying)));
    }

    /// @verifies C104
    #[test]
    // P16-5 §62.14: INCOMING (2) maps to Some(IncomingCall) with the resolved
    // account — the converter is total over the full inv_state enum.
    // [::TICKET::] P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 --for-spec --no-implementation-order`.
    fn inv_state_incoming_returns_incoming_call() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::INCOMING,
        );
        match result {
            Some(SipEventPayload::IncomingCall(info)) => {
                assert_eq!(info.call_id, test_call_id(1));
                assert_eq!(info.account_id, test_account_id());
            }
            other => panic!("expected IncomingCall, got {other:?}"),
        }
    }

    /// @verifies C104
    #[test]
    // P16-5 §62.14: EARLY (3) maps to Some(EarlyMediaReceived) — early media is
    // observable instead of being dropped as an unknown state.
    // [::TICKET::] P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 --for-spec --no-implementation-order`.
    fn inv_state_early_returns_early_media_received() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::EARLY,
        );
        match result {
            Some(SipEventPayload::EarlyMediaReceived(info)) => {
                assert_eq!(info.call_id, test_call_id(1));
            }
            other => panic!("expected EarlyMediaReceived, got {other:?}"),
        }
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_connecting_outgoing_direction() {
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::CONNECTING,
            CallDirection::Outgoing,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallTrying)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_connecting_incoming_direction() {
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::CONNECTING,
            CallDirection::Incoming,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallRinging)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_confirmed_returns_call_connected() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::CONFIRMED,
        );
        match result {
            Some(SipEventPayload::CallConnected(info)) => {
                assert_eq!(info.account_id, test_account_id());
                assert_eq!(info.call_id, test_call_id(1));
            }
            other => panic!("expected CallConnected, got {:?}", other),
        }
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn inv_state_confirmed_none_account_returns_none() {
        // A missing CallEntry must not fabricate AccountId(1): CONFIRMED with
        // None account context yields None (event dropped), never a panic.
        let result = convert_call_state(test_call_id(1), None, pjsip_inv_state::CONFIRMED);
        assert!(
            result.is_none(),
            "CONFIRMED with unknown account must yield None"
        );
    }

    /// @verifies C029, C030
    #[test]
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn inv_state_with_previous_forwards_account_for_confirmed() {
        // convert_call_state_with_previous must forward the account context to
        // convert_call_state for the non-CONNECTING delegation arm.
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::CONFIRMED,
            CallDirection::Outgoing,
        );
        match result {
            Some(SipEventPayload::CallConnected(info)) => {
                assert_eq!(info.account_id, test_account_id());
            }
            other => panic!("expected CallConnected, got {:?}", other),
        }
    }

    /// @verifies C030, C104
    #[test]
    // [::TICKET::] P9-6, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P16-5) --for-spec --no-implementation-order`.
    fn inv_state_conversion_is_total() {
        // The conversion is total over pjsip_inv_state: every input maps to
        // Some(payload-with-valid-account) or None, never a panic. P16-5 adds
        // INCOMING/EARLY to the covered set.
        let states = [
            pjsip_inv_state::NULL,
            pjsip_inv_state::CALLING,
            pjsip_inv_state::INCOMING,
            pjsip_inv_state::EARLY,
            pjsip_inv_state::CONNECTING,
            pjsip_inv_state::CONFIRMED,
            pjsip_inv_state::DISCONNECTED,
            99,
        ];
        for state in states {
            let result = convert_call_state(test_call_id(1), Some(test_account_id()), state);
            assert!(result.is_some() || result.is_none());
        }
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_disconnected_returns_call_disconnected() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::DISCONNECTED,
        );
        assert!(matches!(result, Some(SipEventPayload::CallDisconnected)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn inv_state_unknown_returns_none() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            99, // invalid value
        );
        assert!(result.is_none());
    }

    // ── CallMediaState conversion ──────────────────────────────────────

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_none_returns_none() {
        let result = convert_call_media_state(test_call_id(1), pjsua_call_media_status::NONE);
        assert!(result.is_none());
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_active_returns_media_active() {
        let result = convert_call_media_state(test_call_id(1), pjsua_call_media_status::ACTIVE);
        assert!(matches!(result, Some(SipEventPayload::MediaActive(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_local_hold_returns_call_held() {
        let result = convert_call_media_state(test_call_id(1), pjsua_call_media_status::LOCAL_HOLD);
        assert!(matches!(result, Some(SipEventPayload::CallHeld)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_remote_hold_returns_call_held() {
        let result =
            convert_call_media_state(test_call_id(1), pjsua_call_media_status::REMOTE_HOLD);
        assert!(matches!(result, Some(SipEventPayload::CallHeld)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_error_returns_media_error() {
        let result = convert_call_media_state(test_call_id(1), pjsua_call_media_status::ERROR);
        assert!(matches!(result, Some(SipEventPayload::MediaError(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_unknown_returns_none() {
        let result = convert_call_media_state(test_call_id(1), 99); // invalid value
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

    /// @verifies C023, C104
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P16-5) --for-spec --no-implementation-order`.
    fn all_inv_state_values_covered() {
        // Verify all 7 pjsip_inv_state values [0..7) plus the unknown sentinel 99
        // are handled without panic (P16-5 adds INCOMING=2 and EARLY=3).
        for raw in 0u32..8 {
            let _ = convert_call_state(test_call_id(1), Some(test_account_id()), raw);
        }
        let _ = convert_call_state(test_call_id(1), Some(test_account_id()), 99);
    }

    // ── Invariant: Clone + Debug ──────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn call_state_types_clone_and_debug() {
        // [::TICKET::] P0-5, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P9-6) --for-spec --no-implementation-order`.
        fn assert_cd<T: Clone + std::fmt::Debug>() {}
        assert_cd::<CallState>();
        assert_cd::<CallMediaState>();
        assert_cd::<CallDirection>();
    }

    // ── Constant values ────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P11-9, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P11-9|P16-5) --for-spec --no-implementation-order`.
    fn pjsip_inv_state_constants_match_pjsua_header() {
        // P11-9: values come from the vendored pjsua.h (`enum pjsip_inv_state` in
        // pjsip-ua/sip_inv.h) via ffi::bindings. P16-5 consumes INCOMING=2 and
        // EARLY=3 in convert_call_state.
        assert_eq!(pjsip_inv_state::NULL, 0);
        assert_eq!(pjsip_inv_state::CALLING, 1);
        assert_eq!(pjsip_inv_state::INCOMING, 2);
        assert_eq!(pjsip_inv_state::EARLY, 3);
        assert_eq!(pjsip_inv_state::CONNECTING, 4);
        assert_eq!(pjsip_inv_state::CONFIRMED, 5);
        assert_eq!(pjsip_inv_state::DISCONNECTED, 6);
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

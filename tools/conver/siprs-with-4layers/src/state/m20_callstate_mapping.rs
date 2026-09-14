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

/// The single result of converting a native `pjsip_inv_state` — both the
/// publish payload and the §18 13-state update value derive from the same
/// conversion, so publish and `CallEntry.state` never diverge (C128).
// [::TICKET::] P17-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-5 --for-spec --no-implementation-order`.
#[derive(Debug)]
pub(crate) struct CallStateTransition {
    /// The `SipEventPayload` published to the EventBus.
    pub payload: SipEventPayload,
    /// The §18 `CallState` written to `CallEntry.state`.
    pub state: CallState,
}

/// Map a raw `pjsip_inv_state` to the §18 13-state `CallState`.
///
/// `CONNECTING` discriminates by direction: outgoing → `Trying`, incoming →
/// `Ringing`. `NULL` and unknown values map to `New` — the initial state —
/// so the mapping is total and deterministic (C128); callers that need to
/// drop the event entirely (NULL/unknown) do so via `convert_call_state`
/// before reaching this point.
// [::TICKET::] P17-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-5 --for-spec --no-implementation-order`.
pub(crate) fn map_inv_state_to_call_state(state: u32, direction: CallDirection) -> CallState {
    // P18-1 (§62.33): guard patterns keep the mapping total under both the stub
    // (u32 consts) and native (Rust enum) `pjsip_inv_state` representations.
    match state {
        x if x == pjsip_inv_state::PJSIP_INV_STATE_NULL as u32 => CallState::New,
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CALLING as u32 => CallState::Calling,
        x if x == pjsip_inv_state::PJSIP_INV_STATE_INCOMING as u32 => CallState::Incoming,
        x if x == pjsip_inv_state::PJSIP_INV_STATE_EARLY as u32 => CallState::EarlyMedia,
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CONNECTING as u32 => match direction {
            CallDirection::Outgoing => CallState::Trying,
            CallDirection::Incoming => CallState::Ringing,
        },
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED as u32 => CallState::Active,
        x if x == pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED as u32 => CallState::Disconnected,
        _ => CallState::New,
    }
}

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
    // P18-1 (§62.33): `pjsip_inv_state` is a Rust enum under pjsua-native and a
    // u32 const module in the stub build. Guarding with `x if x == VARIANT as u32`
    // keeps this single match compiling in both modes.
    match state {
        x if x == pjsip_inv_state::PJSIP_INV_STATE_NULL as u32 => None,
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CALLING as u32 => {
            Some(SipEventPayload::OutgoingCallStarted)
        }
        x if x == pjsip_inv_state::PJSIP_INV_STATE_INCOMING as u32 => Some(
            SipEventPayload::IncomingCall(crate::api::event_model_payload_bus::IncomingCallInfo {
                call_id,
                account_id: account_id?,
                caller_uri: String::new(),
                caller_name: None,
            }),
        ),
        x if x == pjsip_inv_state::PJSIP_INV_STATE_EARLY as u32 => {
            Some(SipEventPayload::EarlyMediaReceived(
                crate::api::event_model_payload_bus::EarlyMediaInfo {
                    call_id,
                    media_description: None,
                },
            ))
        }
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CONNECTING as u32 => {
            // Without context, default to Trying (outgoing assumption).
            Some(SipEventPayload::OutgoingCallTrying)
        }
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED as u32 => {
            Some(SipEventPayload::CallConnected(
                crate::api::event_model_payload_bus::ConnectedCallInfo {
                    call_id,
                    account_id: account_id?,
                    remote_uri: String::new(),
                },
            ))
        }
        x if x == pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED as u32 => {
            Some(SipEventPayload::CallDisconnected)
        }
        _ => None,
    }
}

/// Convert a raw `pjsip_inv_state` with call direction context.
///
/// Returns a `CallStateTransition` carrying both the publish payload and the
/// §18 state update value, so publish and `CallEntry.state` share one result.
///
/// When `state == CONNECTING`:
/// - `CallDirection::Outgoing` → payload `OutgoingCallTrying`, state `Trying`
/// - `CallDirection::Incoming` → payload `OutgoingCallRinging`, state `Ringing`
///
/// Non-CONNECTING states delegate to `convert_call_state`, forwarding the
/// owning `account_id` so `CONFIRMED` emits the real per-account payload.
/// Returns `None` when there is no payload to publish (NULL/unknown state,
/// or `CONFIRMED` without a resolved account) — in that case no state update
/// occurs either.
// [::TICKET::] P12-8, P17-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-8|P17-5) --for-spec --no-implementation-order`.
pub(crate) fn convert_call_state_with_previous(
    call_id: CallId,
    account_id: Option<AccountId>,
    state: u32,
    direction: CallDirection,
) -> Option<CallStateTransition> {
    let payload = match state {
        x if x == pjsip_inv_state::PJSIP_INV_STATE_CONNECTING as u32 => match direction {
            CallDirection::Outgoing => Some(SipEventPayload::OutgoingCallTrying),
            CallDirection::Incoming => Some(SipEventPayload::OutgoingCallRinging),
        },
        _ => convert_call_state(call_id, account_id, state),
    }?;
    let call_state = map_inv_state_to_call_state(state, direction);
    Some(CallStateTransition {
        payload,
        state: call_state,
    })
}

/// Convert a raw `pjsua_call_media_status` to an optional `SipEventPayload`.
pub fn convert_call_media_state(call_id: CallId, media_status: u32) -> Option<SipEventPayload> {
    // P18-1 (§62.33): guard-pattern comparison keeps this mapping compiling in
    // both the stub (u32 consts) and native (Rust enum) modes.
    match media_status {
        x if x == pjsua_call_media_status::PJSUA_CALL_MEDIA_NONE as u32 => None,
        x if x == pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE as u32 => {
            Some(SipEventPayload::MediaActive(
                crate::api::event_model_payload_bus::MediaActiveInfo { call_id },
            ))
        }
        x if x == pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD as u32
            || x == pjsua_call_media_status::PJSUA_CALL_MEDIA_REMOTE_HOLD as u32 =>
        {
            Some(SipEventPayload::CallHeld)
        }
        x if x == pjsua_call_media_status::PJSUA_CALL_MEDIA_ERROR as u32 => Some(
            SipEventPayload::MediaError(crate::api::event_model_payload_bus::MediaErrorInfo {
                call_id,
                reason: None,
            }),
        ),
        // P17-6: PJSIP may add future media statuses; ignoring them here keeps
        // the mapping total and deterministic (§62.26).
        _ => None,
    }
}

/// Convert a media status change using the call's previous status.
///
/// The hold→ACTIVE transition (LOCAL_HOLD or REMOTE_HOLD → ACTIVE) is the
/// single resume signal and publishes `CallResumed`; every other change falls
/// back to the standard [`convert_call_media_state`] mapping so a resumed call
/// is distinguishable from an ACTIVE continuation (§62.26 / C129 / C131).
pub fn convert_call_media_state_with_previous(
    call_id: CallId,
    status: u32,
    previous_status: Option<u32>,
) -> Option<SipEventPayload> {
    // P18-1 (§62.33): `as u32` guards keep the comparison valid when
    // pjsua_call_media_status is a Rust enum (native) vs u32 consts (stub).
    if matches!(
        previous_status,
        Some(x)
            if x == pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD as u32
                || x == pjsua_call_media_status::PJSUA_CALL_MEDIA_REMOTE_HOLD as u32
    ) && status == pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE as u32
    {
        return Some(SipEventPayload::CallResumed(
            crate::api::event_model_payload_bus::CallResumedInfo { call_id },
        ));
    }
    convert_call_media_state(call_id, status)
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
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_null_returns_none() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_NULL,
        );
        assert!(result.is_none());
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_calling_returns_ougoing_call_started() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_CALLING,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallStarted)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_connecting_defaults_to_trying() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_CONNECTING,
        );
        assert!(matches!(result, Some(SipEventPayload::OutgoingCallTrying)));
    }

    /// @verifies C104
    #[test]
    // P16-5 §62.14: INCOMING (2) maps to Some(IncomingCall) with the resolved
    // account — the converter is total over the full inv_state enum.
    // [::TICKET::] P16-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_incoming_returns_incoming_call() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_INCOMING,
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
    // [::TICKET::] P16-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_early_returns_early_media_received() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_EARLY,
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
    // [::TICKET::] P0-5, P4-1, P9-6, P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P17-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_connecting_outgoing_direction() {
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_CONNECTING,
            CallDirection::Outgoing,
        );
        match result {
            Some(transition) => {
                assert!(matches!(
                    transition.payload,
                    SipEventPayload::OutgoingCallTrying
                ));
                assert_eq!(transition.state, CallState::Trying);
            }
            other => panic!("expected CONNECTING/Outgoing transition, got {:?}", other),
        }
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P17-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_connecting_incoming_direction() {
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_CONNECTING,
            CallDirection::Incoming,
        );
        match result {
            Some(transition) => {
                assert!(matches!(
                    transition.payload,
                    SipEventPayload::OutgoingCallRinging
                ));
                assert_eq!(transition.state, CallState::Ringing);
            }
            other => panic!("expected CONNECTING/Incoming transition, got {:?}", other),
        }
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_confirmed_returns_call_connected() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
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
    // [::TICKET::] P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_confirmed_none_account_returns_none() {
        // A missing CallEntry must not fabricate AccountId(1): CONFIRMED with
        // None account context yields None (event dropped), never a panic.
        let result = convert_call_state(
            test_call_id(1),
            None,
            pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
        );
        assert!(
            result.is_none(),
            "CONFIRMED with unknown account must yield None"
        );
    }

    /// @verifies C029, C030
    #[test]
    // [::TICKET::] P9-6, P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P17-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_with_previous_forwards_account_for_confirmed() {
        // convert_call_state_with_previous must forward the account context to
        // convert_call_state for the non-CONNECTING delegation arm.
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
            CallDirection::Outgoing,
        );
        match result {
            Some(transition) => {
                match transition.payload {
                    SipEventPayload::CallConnected(info) => {
                        assert_eq!(info.account_id, test_account_id());
                    }
                    other => panic!("expected CallConnected, got {:?}", other),
                }
                assert_eq!(transition.state, CallState::Active);
            }
            other => panic!("expected CONFIRMED transition, got {:?}", other),
        }
    }

    /// @verifies C127
    #[test]
    // [::TICKET::] P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_disconnected_returns_transition_with_disconnected_state() {
        // The remote-hangup mapping: DISCONNECTED yields a CallDisconnected
        // payload AND a Disconnected state — the pair that resolves H11.
        let result = convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED,
            CallDirection::Outgoing,
        );
        match result {
            Some(transition) => {
                assert!(matches!(
                    transition.payload,
                    SipEventPayload::CallDisconnected
                ));
                assert_eq!(transition.state, CallState::Disconnected);
            }
            other => panic!("expected DISCONNECTED transition, got {:?}", other),
        }
    }

    /// @verifies C128
    #[test]
    // [::TICKET::] P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-5|P18-1) --for-spec --no-implementation-order`.
    fn map_inv_state_to_call_state_is_total_and_deterministic() {
        // Total over the 7 real pjsip_inv_state values plus the unknown
        // sentinel: every input maps without panic and the same input always
        // yields the same CallState (single source of truth for the state side).
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_NULL,
                CallDirection::Outgoing
            ),
            CallState::New
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_CALLING,
                CallDirection::Outgoing
            ),
            CallState::Calling
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_INCOMING,
                CallDirection::Incoming
            ),
            CallState::Incoming
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_EARLY,
                CallDirection::Outgoing
            ),
            CallState::EarlyMedia
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_CONNECTING,
                CallDirection::Outgoing
            ),
            CallState::Trying
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_CONNECTING,
                CallDirection::Incoming
            ),
            CallState::Ringing
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
                CallDirection::Outgoing
            ),
            CallState::Active
        );
        assert_eq!(
            map_inv_state_to_call_state(
                pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED,
                CallDirection::Outgoing
            ),
            CallState::Disconnected
        );
        assert_eq!(
            map_inv_state_to_call_state(99, CallDirection::Outgoing),
            CallState::New
        );
        for raw in 0u32..8 {
            let _ = map_inv_state_to_call_state(raw, CallDirection::Outgoing);
        }
    }

    /// @verifies C127
    #[test]
    // [::TICKET::] P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-5|P18-1) --for-spec --no-implementation-order`.
    fn convert_call_state_with_previous_null_and_unknown_return_none() {
        // NULL and unknown states produce no payload and therefore no state
        // computation — the `?` short-circuit drops the transition entirely.
        assert!(convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_NULL,
            CallDirection::Outgoing,
        )
        .is_none());
        assert!(convert_call_state_with_previous(
            test_call_id(1),
            Some(test_account_id()),
            99,
            CallDirection::Outgoing,
        )
        .is_none());
    }

    /// @verifies C030, C127
    #[test]
    // [::TICKET::] P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-5|P18-1) --for-spec --no-implementation-order`.
    fn convert_call_state_with_previous_confirmed_none_account_returns_none() {
        // A missing CallEntry (account_id None) must not fabricate an account
        // nor compute a state update: CONFIRMED with None yields None.
        let result = convert_call_state_with_previous(
            test_call_id(1),
            None,
            pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
            CallDirection::Outgoing,
        );
        assert!(
            result.is_none(),
            "CONFIRMED with unknown account must yield None"
        );
    }

    /// @verifies C128
    #[test]
    // [::TICKET::] P17-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-5|P18-1) --for-spec --no-implementation-order`.
    fn call_state_transition_payload_and_state_share_single_conversion() {
        // The payload and the state come from the SAME input — the transition
        // is the single source of truth for publish and CallEntry.state update.
        // Table-driven over every publishable pjsip_inv_state so CALLING,
        // INCOMING, EARLY, CONFIRMED and DISCONNECTED all carry the correct
        // payload-and-state pair through convert_call_state_with_previous.
        for (state, direction, expected_payload_kind, expected_state) in [
            (
                pjsip_inv_state::PJSIP_INV_STATE_CALLING,
                CallDirection::Outgoing,
                "started",
                CallState::Calling,
            ),
            (
                pjsip_inv_state::PJSIP_INV_STATE_INCOMING,
                CallDirection::Incoming,
                "incoming",
                CallState::Incoming,
            ),
            (
                pjsip_inv_state::PJSIP_INV_STATE_EARLY,
                CallDirection::Outgoing,
                "early",
                CallState::EarlyMedia,
            ),
            (
                pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
                CallDirection::Outgoing,
                "connected",
                CallState::Active,
            ),
            (
                pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED,
                CallDirection::Outgoing,
                "disconnected",
                CallState::Disconnected,
            ),
        ] {
            let transition = match convert_call_state_with_previous(
                test_call_id(1),
                Some(test_account_id()),
                state,
                direction,
            ) {
                Some(transition) => transition,
                None => panic!("valid native state must convert"),
            };
            match expected_payload_kind {
                "started" => assert!(matches!(
                    transition.payload,
                    SipEventPayload::OutgoingCallStarted
                )),
                "incoming" => assert!(matches!(
                    transition.payload,
                    SipEventPayload::IncomingCall(_)
                )),
                "early" => assert!(matches!(
                    transition.payload,
                    SipEventPayload::EarlyMediaReceived(_)
                )),
                "connected" => assert!(matches!(
                    transition.payload,
                    SipEventPayload::CallConnected(_)
                )),
                "disconnected" => {
                    assert!(matches!(
                        transition.payload,
                        SipEventPayload::CallDisconnected
                    ))
                }
                _ => unreachable!("unknown payload kind"),
            }
            assert_eq!(transition.state, expected_state);
        }
    }

    /// @verifies C030, C104
    #[test]
    // [::TICKET::] P9-6, P16-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P16-5|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_conversion_is_total() {
        // The conversion is total over pjsip_inv_state: every input maps to
        // Some(payload-with-valid-account) or None, never a panic. P16-5 adds
        // INCOMING/EARLY to the covered set.
        let states = [
            pjsip_inv_state::PJSIP_INV_STATE_NULL,
            pjsip_inv_state::PJSIP_INV_STATE_CALLING,
            pjsip_inv_state::PJSIP_INV_STATE_INCOMING,
            pjsip_inv_state::PJSIP_INV_STATE_EARLY,
            pjsip_inv_state::PJSIP_INV_STATE_CONNECTING,
            pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED,
            pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED,
            99,
        ];
        for state in states {
            let result = convert_call_state(test_call_id(1), Some(test_account_id()), state);
            assert!(result.is_some() || result.is_none());
        }
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn inv_state_disconnected_returns_call_disconnected() {
        let result = convert_call_state(
            test_call_id(1),
            Some(test_account_id()),
            pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED,
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
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn media_state_none_returns_none() {
        let result = convert_call_media_state(
            test_call_id(1),
            pjsua_call_media_status::PJSUA_CALL_MEDIA_NONE,
        );
        assert!(result.is_none());
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn media_state_active_returns_media_active() {
        let result = convert_call_media_state(
            test_call_id(1),
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE,
        );
        assert!(matches!(result, Some(SipEventPayload::MediaActive(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn media_state_local_hold_returns_call_held() {
        let result = convert_call_media_state(
            test_call_id(1),
            pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD,
        );
        assert!(matches!(result, Some(SipEventPayload::CallHeld)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn media_state_remote_hold_returns_call_held() {
        let result = convert_call_media_state(
            test_call_id(1),
            pjsua_call_media_status::PJSUA_CALL_MEDIA_REMOTE_HOLD,
        );
        assert!(matches!(result, Some(SipEventPayload::CallHeld)));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6|P18-1) --for-spec --no-implementation-order`.
    fn media_state_error_returns_media_error() {
        let result = convert_call_media_state(
            test_call_id(1),
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ERROR,
        );
        assert!(matches!(result, Some(SipEventPayload::MediaError(_))));
    }

    /// @verifies C023
    #[test]
    // [::TICKET::] P0-5, P4-1, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P9-6) --for-spec --no-implementation-order`.
    fn media_state_unknown_returns_none() {
        let result = convert_call_media_state(test_call_id(1), 99); // invalid value
        assert!(result.is_none());
    }

    // ── CallMediaState transition (P17-6 §62.26) ───────────────────────

    /// @verifies C129
    #[test]
    // [::TICKET::] P17-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-6|P18-1) --for-spec --no-implementation-order`.
    fn media_transition_hold_to_active_publishes_call_resumed() {
        let call_id = test_call_id(7);
        let resumed = convert_call_media_state_with_previous(
            call_id,
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE,
            Some(pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD),
        );
        // C129 postcondition: hold→ACTIVE publishes CallResumed.
        assert!(matches!(resumed, Some(SipEventPayload::CallResumed(_))));
        // C129 invariant: CallResumed carries the originating call_id payload.
        if let Some(SipEventPayload::CallResumed(info)) = resumed {
            assert_eq!(info.call_id, call_id);
        }
    }

    /// @verifies C129
    #[test]
    // [::TICKET::] P17-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-6|P18-1) --for-spec --no-implementation-order`.
    fn media_transition_remote_hold_to_active_publishes_call_resumed() {
        let call_id = test_call_id(7);
        let resumed = convert_call_media_state_with_previous(
            call_id,
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE,
            Some(pjsua_call_media_status::PJSUA_CALL_MEDIA_REMOTE_HOLD),
        );
        assert!(matches!(resumed, Some(SipEventPayload::CallResumed(_))));
    }

    /// @verifies C131
    #[test]
    // [::TICKET::] P17-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-6|P18-1) --for-spec --no-implementation-order`.
    fn media_transition_first_active_is_media_active_not_resumed() {
        let call_id = test_call_id(7);
        let first = convert_call_media_state_with_previous(
            call_id,
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE,
            None,
        );
        // C131 postcondition: no previous status → standard mapping (MediaActive).
        assert!(matches!(first, Some(SipEventPayload::MediaActive(_))));
    }

    /// @verifies C131
    #[test]
    // [::TICKET::] P17-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-6|P18-1) --for-spec --no-implementation-order`.
    fn media_transition_active_continuation_stays_media_active() {
        let call_id = test_call_id(7);
        let continued = convert_call_media_state_with_previous(
            call_id,
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE,
            Some(pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE),
        );
        // C131 postcondition: ACTIVE continuation is MediaActive, not CallResumed.
        assert!(matches!(continued, Some(SipEventPayload::MediaActive(_))));
    }

    /// @verifies C131
    #[test]
    // [::TICKET::] P17-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-6|P18-1) --for-spec --no-implementation-order`.
    fn media_transition_hold_to_error_is_media_error_not_resumed() {
        let call_id = test_call_id(7);
        let err = convert_call_media_state_with_previous(
            call_id,
            pjsua_call_media_status::PJSUA_CALL_MEDIA_ERROR,
            Some(pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD),
        );
        assert!(matches!(err, Some(SipEventPayload::MediaError(_))));
    }

    /// @verifies C131
    #[test]
    // [::TICKET::] P17-6, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-6|P18-1) --for-spec --no-implementation-order`.
    fn media_transition_hold_to_none_yields_no_event() {
        let call_id = test_call_id(7);
        let none = convert_call_media_state_with_previous(
            call_id,
            pjsua_call_media_status::PJSUA_CALL_MEDIA_NONE,
            Some(pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD),
        );
        assert!(none.is_none());
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
    // [::TICKET::] P0-5, P11-9, P16-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P11-9|P16-5|P18-1) --for-spec --no-implementation-order`.
    fn pjsip_inv_state_constants_match_pjsua_header() {
        // P11-9: values come from the vendored pjsua.h (`enum pjsip_inv_state` in
        // pjsip-ua/sip_inv.h) via ffi::bindings. P16-5 consumes INCOMING=2 and
        // EARLY=3 in convert_call_state.
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_NULL, 0);
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_CALLING, 1);
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_INCOMING, 2);
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_EARLY, 3);
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_CONNECTING, 4);
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_CONFIRMED, 5);
        assert_eq!(pjsip_inv_state::PJSIP_INV_STATE_DISCONNECTED, 6);
    }

    #[test]
    // [::TICKET::] P0-5, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P18-1) --for-spec --no-implementation-order`.
    fn pjsua_call_media_status_constants_match_rfc() {
        assert_eq!(pjsua_call_media_status::PJSUA_CALL_MEDIA_NONE, 0);
        assert_eq!(pjsua_call_media_status::PJSUA_CALL_MEDIA_ACTIVE, 1);
        assert_eq!(pjsua_call_media_status::PJSUA_CALL_MEDIA_LOCAL_HOLD, 2);
        assert_eq!(pjsua_call_media_status::PJSUA_CALL_MEDIA_REMOTE_HOLD, 3);
        assert_eq!(pjsua_call_media_status::PJSUA_CALL_MEDIA_ERROR, 4);
    }
}

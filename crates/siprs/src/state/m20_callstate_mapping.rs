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

//! pjsip_inv_state to SipEventPayload mapping and media_status conversion.
//!
//! ## Design
//!
//! [`convert_call_state`] maps PJSIP invite session state (pjsip_inv_state, values
//! 0–4) to `SipEventPayload` variants. [`convert_call_media_state`] maps PJSIP
//! call media status to `SipEventPayload` variants.
//!
//! Both functions are pure (no side effects) and receive PJSIP integer codes as
//! `i32`. The actual FFI constant names (`PJSIP_INV_STATE_CALLING`, etc.) are
//! not yet available — they will be provided by the `ffi` module (P1+). The
//! named integer constants below mirror the PJSIP definitions so that switching
//! to the real FFI constants is a mechanical replacement.
//!
//! ## CONNECTING discrimination
//!
//! `pjsip_inv_state=2` (CONNECTING) can map to either `OutgoingCallTrying`
//! (when transitioning from CALLING) or `IncomingCall` (when transitioning from
//! an incoming state). The caller supplies `previous_state` to disambiguate.

use crate::api::event_model_payload_bus::SipEventPayload;

// ---------------------------------------------------------------------------
// PJSIP constant mirrors (i32)
// ---------------------------------------------------------------------------

/// PJSIP invite session is in NULL state (initial, before CREATE).
const PJSIP_INV_STATE_NULL: i32 = 0;
/// PJSIP invite session is in CALLING state (outgoing INVITE sent).
const PJSIP_INV_STATE_CALLING: i32 = 1;
/// PJSIP invite session is in CONNECTING state (early media / ringing).
const PJSIP_INV_STATE_CONNECTING: i32 = 2;
/// PJSIP invite session is in CONFIRMED state (media negotiated).
const PJSIP_INV_STATE_CONFIRMED: i32 = 3;
/// PJSIP invite session is in DISCONNECTED state.
const PJSIP_INV_STATE_DISCONNECTED: i32 = 4;

/// PJSIP call media is not established yet.
const PJSUA_CALL_MEDIA_NONE: i32 = 0;
/// PJSIP call media is active (sending/receiving).
const PJSUA_CALL_MEDIA_ACTIVE: i32 = 1;
/// PJSIP call media is on local hold.
const PJSUA_CALL_MEDIA_LOCAL_HOLD: i32 = 2;
/// PJSIP call media is on remote hold.
const PJSUA_CALL_MEDIA_REMOTE_HOLD: i32 = 3;
/// PJSIP call media has an error.
const PJSUA_CALL_MEDIA_ERROR: i32 = 4;

// ---------------------------------------------------------------------------
// convert_call_state
// ---------------------------------------------------------------------------

/// Maps a `pjsip_inv_state` value to the corresponding `SipEventPayload`.
///
/// Returns `None` for `PJSIP_INV_STATE_NULL` (no event is emitted for the
/// initial empty handle). For `PJSIP_INV_STATE_CONNECTING`, the
/// `previous_state` parameter discriminates between outgoing-trying (previous
/// state was CALLING) and incoming-ringing (previous state was INCOMING).
///
/// When `previous_state` is `None` and the inv_state is CONNECTING, this
/// function returns `None` as a safe default.
///
/// # Arguments
///
/// * `inv_state` — The integer value of `pjsip_inv_state` (0–4).
/// * `previous_state` — The previous `pjsip_inv_state` value, if known. Used
///   for CONNECTING discrimination.
pub(crate) fn convert_call_state(
    inv_state: i32,
    previous_state: Option<i32>,
) -> Option<SipEventPayload> {
    match inv_state {
        PJSIP_INV_STATE_NULL => None,
        PJSIP_INV_STATE_CALLING => Some(SipEventPayload::OutgoingCallStarted),
        PJSIP_INV_STATE_CONNECTING => {
            // Discriminate between outgoing-trying (previous was CALLING)
            // and incoming-ringing (previous was an incoming-originated state).
            match previous_state {
                Some(PJSIP_INV_STATE_CALLING) => Some(SipEventPayload::OutgoingCallTrying),
                Some(_) => Some(SipEventPayload::IncomingCall),
                None => None,
            }
        }
        PJSIP_INV_STATE_CONFIRMED => Some(SipEventPayload::CallConnected),
        PJSIP_INV_STATE_DISCONNECTED => Some(SipEventPayload::CallDisconnected),
        // Unknown inv_state values: safe default (no event emitted).
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// convert_call_media_state
// ---------------------------------------------------------------------------

/// Maps a PJSIP call media status value to the corresponding `SipEventPayload`.
///
/// Returns `None` for `PJSUA_CALL_MEDIA_NONE` (media not yet established).
///
/// # Arguments
///
/// * `media_status` — The integer value of `pjsua_call_media_status` (0–4).
pub(crate) fn convert_call_media_state(media_status: i32) -> Option<SipEventPayload> {
    match media_status {
        PJSUA_CALL_MEDIA_NONE => None,
        PJSUA_CALL_MEDIA_ACTIVE => Some(SipEventPayload::MediaActive),
        PJSUA_CALL_MEDIA_LOCAL_HOLD | PJSUA_CALL_MEDIA_REMOTE_HOLD => {
            Some(SipEventPayload::CallHeld)
        }
        PJSUA_CALL_MEDIA_ERROR => Some(SipEventPayload::MediaError),
        // Unknown media_status values: safe default (no event emitted).
        _ => None,
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::SipEventPayload;

    // -----------------------------------------------------------------------
    // ── Precondition: function signatures exist ──────────────────────────
    // ── C023-precondition ────────────────────────────────────────────────

    /// @verifies C023-precondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn convert_call_state_function_signature_exists() {
        let _ = convert_call_state as fn(i32, Option<i32>) -> Option<SipEventPayload>;
    }

    /// @verifies C023-precondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn convert_call_media_state_function_signature_exists() {
        let _ = convert_call_media_state as fn(i32) -> Option<SipEventPayload>;
    }

    // -----------------------------------------------------------------------
    // ── C023-postcondition: pjsip_inv_state 0-4 mapping ──────────────────
    // -----------------------------------------------------------------------

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_null_returns_none() {
        assert_eq!(convert_call_state(PJSIP_INV_STATE_NULL, None), None);
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_calling_returns_outgoing_call_started() {
        assert_eq!(
            convert_call_state(PJSIP_INV_STATE_CALLING, None),
            Some(SipEventPayload::OutgoingCallStarted)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_connecting_from_calling_returns_trying() {
        assert_eq!(
            convert_call_state(PJSIP_INV_STATE_CONNECTING, Some(PJSIP_INV_STATE_CALLING)),
            Some(SipEventPayload::OutgoingCallTrying)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_connecting_from_incoming_returns_ringing() {
        // Use a value different from CALLING (e.g., 5) to simulate an
        // incoming-originated previous state.
        assert_eq!(
            convert_call_state(PJSIP_INV_STATE_CONNECTING, Some(5)),
            Some(SipEventPayload::IncomingCall)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_connecting_no_previous_returns_none_safe_default() {
        assert_eq!(convert_call_state(PJSIP_INV_STATE_CONNECTING, None), None);
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_confirmed_returns_call_connected() {
        assert_eq!(
            convert_call_state(PJSIP_INV_STATE_CONFIRMED, None),
            Some(SipEventPayload::CallConnected)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn inv_state_disconnected_returns_call_disconnected() {
        assert_eq!(
            convert_call_state(PJSIP_INV_STATE_DISCONNECTED, None),
            Some(SipEventPayload::CallDisconnected)
        );
    }

    // -----------------------------------------------------------------------
    // ── C023-postcondition: media_status conversion ──────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn media_none_returns_none() {
        assert_eq!(convert_call_media_state(PJSUA_CALL_MEDIA_NONE), None);
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn media_active_returns_media_active() {
        assert_eq!(
            convert_call_media_state(PJSUA_CALL_MEDIA_ACTIVE),
            Some(SipEventPayload::MediaActive)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn media_local_hold_returns_call_held() {
        assert_eq!(
            convert_call_media_state(PJSUA_CALL_MEDIA_LOCAL_HOLD),
            Some(SipEventPayload::CallHeld)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn media_remote_hold_returns_call_held() {
        assert_eq!(
            convert_call_media_state(PJSUA_CALL_MEDIA_REMOTE_HOLD),
            Some(SipEventPayload::CallHeld)
        );
    }

    /// @verifies C023-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn media_error_returns_media_error() {
        assert_eq!(
            convert_call_media_state(PJSUA_CALL_MEDIA_ERROR),
            Some(SipEventPayload::MediaError)
        );
    }

    // -----------------------------------------------------------------------
    // ── C023-invariant: exhaustive match ─────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C023-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn unknown_inv_state_returns_none_safe_default() {
        // Values outside the 0-4 range should return None (safe default).
        assert_eq!(convert_call_state(-1, None), None);
        assert_eq!(convert_call_state(99, None), None);
    }

    /// @verifies C023-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn unknown_media_status_returns_none_safe_default() {
        // Values outside the 0-4 range should return None (safe default).
        assert_eq!(convert_call_media_state(-1), None);
        assert_eq!(convert_call_media_state(99), None);
    }

    // -----------------------------------------------------------------------
    // ── C022-invariant: SipEventPayload variants constructible ──────────
    // -----------------------------------------------------------------------

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn all_call_media_variants_constructible() {
        let _ = SipEventPayload::OutgoingCallStarted;
        let _ = SipEventPayload::OutgoingCallTrying;
        let _ = SipEventPayload::OutgoingCallRinging;
        let _ = SipEventPayload::EarlyMediaReceived;
        let _ = SipEventPayload::CallConnected;
        let _ = SipEventPayload::IncomingCall;
        let _ = SipEventPayload::CallDisconnected;
        let _ = SipEventPayload::CallCancelled;
        let _ = SipEventPayload::CallRejected;
        let _ = SipEventPayload::CallHeld;
        let _ = SipEventPayload::CallResumed;
        let _ = SipEventPayload::ReferReceived;
        let _ = SipEventPayload::TransferCompleted;
        let _ = SipEventPayload::MediaActive;
        let _ = SipEventPayload::MediaStopped;
        let _ = SipEventPayload::MediaError;
    }
}

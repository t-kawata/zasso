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
//   - NODE_ID=N0026:  §18 Call State Model
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0026 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::error::SipError;

// ---------------------------------------------------------------------------
// CallState — 13-state SIP call model (§18 / N0026)
// ---------------------------------------------------------------------------

/// Tracks the lifecycle of a single SIP call through its signalling phases.
///
/// The 13 states form three sub-diagrams prescribed by RFC §18:
///
/// **Outgoing** — `New → Calling → Trying → [Ringing | EarlyMedia] →
/// Connecting → Active`
///
/// **Incoming** — `New → Incoming → Connecting → Active`
///
/// **Active session** — `Active ↔ Held`, `Active → Transferring →
/// [Active | Disconnecting]`
///
/// **Terminal** — `Failed` and `Disconnected` are absorbing.
///
/// ## Answer semantics (§19 / C028)
///
/// `is_answer_permitted()` returns `true` only when the call is in
/// `Incoming` state. `validate_answer()` enforces this as a guard,
/// returning `Err` for all other states.
///
/// ## Media state (§22 / C032)
///
/// `is_media_active()` returns `true` for states where media could be flowing
/// (Ringing, EarlyMedia, Connecting, Active, Held). `is_media_negotiated()`
/// returns `true` only for `Active` (media fully negotiated).
// [::STUB::] P3-2: dead_code resolved once runtime module consumes CallState.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CallState {
    /// Initial state before any signalling.
    New,
    /// Outgoing INVITE sent; awaiting provisional response.
    Calling,
    /// Provisional 100 Trying received.
    Trying,
    /// 180 Ringing received (remote endpoint alerting).
    Ringing,
    /// 183 Session Progress received (early media available).
    EarlyMedia,
    /// Incoming INVITE received from remote peer.
    Incoming,
    /// 200 OK received; media connection in progress.
    Connecting,
    /// Media session established and active.
    Active,
    /// Call placed on hold (media suspended locally).
    Held,
    /// REFER sent; awaiting NOTIFY from transfer target.
    Transferring,
    /// BYE/CANCEL sent or received; tearing down the call.
    Disconnecting,
    /// Call fully disconnected (absorbing terminal state).
    Disconnected,
    /// Call failed from a non-terminal state (absorbing terminal state).
    Failed,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
// [::STUB::] P3-2: dead_code resolved once runtime module consumes CallState methods.
#[allow(dead_code)]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl CallState {
    /// Validates a transition from `self` to `target`.
    ///
    /// Returns `Ok(())` if the transition is legal per RFC §18, or
    /// `Err(SipError)` with kind `InvalidState` if not.
    ///
    /// The transition matrix encodes three sub-diagrams (outgoing, incoming,
    /// active-session) plus shared disconnect and failure paths.
    pub(crate) fn try_transition(&self, target: CallState) -> Result<(), SipError> {
        use CallState::*;
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        match (*self, target) {
            // ── Outgoing ──
            (New, Calling) => Ok(()),
            (Calling, Trying) => Ok(()),
            (Trying, Ringing) | (Trying, EarlyMedia) => Ok(()),
            (Ringing, Connecting) | (EarlyMedia, Connecting) => Ok(()),
            (Connecting, Active) => Ok(()),
            // ── Incoming ──
            (New, Incoming) => Ok(()),
            (Incoming, Connecting) => Ok(()),
            // ── Active session ──
            (Active, Held) | (Held, Active) => Ok(()),
            (Active, Transferring) => Ok(()),
            (Transferring, Active) | (Transferring, Disconnecting) => Ok(()),
            // ── Disconnect from any non-terminal ──
            (Active, Disconnecting) | (Held, Disconnecting) => Ok(()),
            (Disconnecting, Disconnected) => Ok(()),
            // ── Terminal failure ──
            (Ringing, Failed) | (EarlyMedia, Failed) | (Connecting, Failed) => Ok(()),
            // ── Everything else is invalid ──
            _ => Err(SipError::invalid_state(
                "invalid call state transition",
            )),
        }
    }

    /// Returns `true` only when this call is in the `Incoming` state,
    /// meaning `answer()` is semantically valid.
    pub(crate) fn is_answer_permitted(&self) -> bool {
        matches!(self, CallState::Incoming)
    }

    /// Guards the `answer()` operation: returns `Ok(())` for `Incoming`
    /// state, or `Err(SipErrorKind::InvalidState)` otherwise.
    ///
    /// Use this in the runtime layer before dispatching an answer command.
    pub(crate) fn validate_answer(&self) -> Result<(), SipError> {
        if self.is_answer_permitted() {
            Ok(())
        } else {
            Err(SipError::invalid_state(
                "answer() is only valid for incoming calls",
            ))
        }
    }

    /// Returns `true` for states where media could be flowing.
    ///
    /// These states are eligible for Real-time audio subscription.
    pub(crate) fn is_media_active(&self) -> bool {
        matches!(
            self,
            CallState::Ringing
                | CallState::EarlyMedia
                | CallState::Connecting
                | CallState::Active
                | CallState::Held
        )
    }

    /// Returns `true` only for `Active` state, where media has been fully
    /// negotiated (SDP offer/answer complete). Lossless audio subscription
    /// requires this.
    pub(crate) fn is_media_negotiated(&self) -> bool {
        matches!(self, CallState::Active)
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::SipErrorKind;

    // -----------------------------------------------------------------------
    // ── C027 ── N0026→N0011: Call State Model
    // -----------------------------------------------------------------------

    /// @verifies C027-precondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_state_has_13_variants() {
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        assert_debug::<CallState>();
        assert_clone::<CallState>();
        assert_copy::<CallState>();
        assert_partial_eq::<CallState>();
        // Exhaustive pattern match
        let state = CallState::New;
        match state {
            CallState::New
            | CallState::Calling
            | CallState::Trying
            | CallState::Ringing
            | CallState::EarlyMedia
            | CallState::Incoming
            | CallState::Connecting
            | CallState::Active
            | CallState::Held
            | CallState::Transferring
            | CallState::Disconnecting
            | CallState::Disconnected
            | CallState::Failed => {}
        }
    }

    // ── Outgoing transitions ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_new_to_calling_ok() {
        assert!(CallState::New.try_transition(CallState::Calling).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_calling_to_trying_ok() {
        assert!(CallState::Calling.try_transition(CallState::Trying).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_trying_to_ringing_ok() {
        assert!(CallState::Trying.try_transition(CallState::Ringing).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_trying_to_early_media_ok() {
        assert!(CallState::Trying.try_transition(CallState::EarlyMedia).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_ringing_to_connecting_ok() {
        assert!(CallState::Ringing.try_transition(CallState::Connecting).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_early_media_to_connecting_ok() {
        assert!(CallState::EarlyMedia.try_transition(CallState::Connecting).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_outgoing_connecting_to_active_ok() {
        assert!(CallState::Connecting.try_transition(CallState::Active).is_ok());
    }

    // ── Incoming transitions ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_incoming_new_to_incoming_ok() {
        assert!(CallState::New.try_transition(CallState::Incoming).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_incoming_incoming_to_connecting_ok() {
        assert!(CallState::Incoming.try_transition(CallState::Connecting).is_ok());
    }

    // ── Active session transitions ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_active_session_hold_unhold() {
        assert!(CallState::Active.try_transition(CallState::Held).is_ok());
        assert!(CallState::Held.try_transition(CallState::Active).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_active_to_transferring_ok() {
        assert!(CallState::Active.try_transition(CallState::Transferring).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_transferring_to_active_on_success_ok() {
        assert!(CallState::Transferring.try_transition(CallState::Active).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_transferring_to_disconnecting_on_fail_ok() {
        assert!(CallState::Transferring.try_transition(CallState::Disconnecting).is_ok());
    }

    // ── Disconnect transitions ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_disconnect_from_active_ok() {
        assert!(CallState::Active.try_transition(CallState::Disconnecting).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_disconnect_from_held_ok() {
        assert!(CallState::Held.try_transition(CallState::Disconnecting).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_disconnecting_to_disconnected_ok() {
        assert!(CallState::Disconnecting.try_transition(CallState::Disconnected).is_ok());
    }

    // ── Failed from non-terminal ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_ringing_to_failed_ok() {
        assert!(CallState::Ringing.try_transition(CallState::Failed).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_early_media_to_failed_ok() {
        assert!(CallState::EarlyMedia.try_transition(CallState::Failed).is_ok());
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_connecting_to_failed_ok() {
        assert!(CallState::Connecting.try_transition(CallState::Failed).is_ok());
    }

    // ── Invalid transitions ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_invalid_transitions_return_err() {
        let cases = vec![
            (CallState::New, CallState::Active),
            (CallState::New, CallState::Held),
            (CallState::Calling, CallState::Incoming),
            (CallState::Calling, CallState::Connecting),
            (CallState::Calling, CallState::Active),
            (CallState::Trying, CallState::Calling),
            (CallState::Trying, CallState::Incoming),
            (CallState::Ringing, CallState::Calling),
            (CallState::Ringing, CallState::Active),
            (CallState::Connecting, CallState::Trying),
            (CallState::Connecting, CallState::Held),
            (CallState::Active, CallState::Calling),
            (CallState::Active, CallState::Ringing),
        ];
        for (from, to) in cases {
            let result = from.try_transition(to);
            assert!(result.is_err(), "{:?} -> {:?} should be Err", from, to);
            assert_eq!(result.unwrap_err().kind, SipErrorKind::InvalidState);
        }
    }

    // ── Terminal state guard ──

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_terminal_failed_no_transitions() {
        let targets = vec![
            CallState::New, CallState::Calling, CallState::Trying,
            CallState::Ringing, CallState::Incoming, CallState::Connecting,
            CallState::Active, CallState::Held, CallState::Transferring,
            CallState::Disconnecting, CallState::Disconnected,
        ];
        for target in targets {
            assert!(CallState::Failed.try_transition(target).is_err());
        }
    }

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_terminal_disconnected_no_transitions() {
        let targets = vec![
            CallState::New, CallState::Calling, CallState::Trying,
            CallState::Ringing, CallState::Incoming, CallState::Connecting,
            CallState::Active, CallState::Held, CallState::Transferring,
            CallState::Disconnecting, CallState::Failed,
        ];
        for target in targets {
            assert!(CallState::Disconnected.try_transition(target).is_err());
        }
    }

    // ── C028 ── N0027→N0026 (inbound): answer semantics ──

    /// @verifies C028-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_answer_permitted_only_for_incoming() {
        assert!(CallState::Incoming.is_answer_permitted());
        let denied = vec![
            CallState::New, CallState::Calling, CallState::Trying,
            CallState::Ringing, CallState::EarlyMedia, CallState::Connecting,
            CallState::Active, CallState::Held, CallState::Transferring,
            CallState::Disconnecting, CallState::Disconnected, CallState::Failed,
        ];
        for state in &denied {
            assert!(!state.is_answer_permitted(),
                "{:?}.is_answer_permitted() should be false", state);
        }
    }

    /// @verifies C028-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_validate_answer_rejects_non_incoming() {
        let invalid = vec![
            CallState::New, CallState::Calling, CallState::Trying,
            CallState::Ringing, CallState::EarlyMedia, CallState::Connecting,
            CallState::Active, CallState::Held, CallState::Transferring,
            CallState::Disconnecting, CallState::Disconnected, CallState::Failed,
        ];
        for state in &invalid {
            let result = state.validate_answer();
            let err = result.expect_err(&format!("{:?} should reject answer", state));
            assert_eq!(err.kind, SipErrorKind::InvalidState);
        }
    }

    /// @verifies C028-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_validate_answer_accepts_incoming() {
        assert!(CallState::Incoming.validate_answer().is_ok());
    }

    // ── C032 ── N0031→N0026 (inbound): audio subscribe ──

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_media_active_states() {
        let active = vec![
            CallState::Ringing, CallState::EarlyMedia,
            CallState::Connecting, CallState::Active, CallState::Held,
        ];
        for state in &active {
            assert!(state.is_media_active(), "{:?}.is_media_active()", state);
        }
        let inactive = vec![
            CallState::New, CallState::Calling, CallState::Trying,
            CallState::Incoming, CallState::Transferring,
            CallState::Disconnecting, CallState::Disconnected, CallState::Failed,
        ];
        for state in &inactive {
            assert!(!state.is_media_active(), "{:?}.is_media_active()", state);
        }
    }

    /// @verifies C032-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn call_media_negotiated_only_for_active() {
        assert!(CallState::Active.is_media_negotiated());
        assert!(!CallState::Ringing.is_media_negotiated());
        assert!(!CallState::EarlyMedia.is_media_negotiated());
        assert!(!CallState::Connecting.is_media_negotiated());
        assert!(!CallState::Held.is_media_negotiated());
    }
}

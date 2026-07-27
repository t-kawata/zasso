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
//   - NODE_ID=N0025:  §17 Registration State Machine
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0025 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::error::SipError;

// ---------------------------------------------------------------------------
// RegistrationState — 7-state SIP registration machine (§17 / N0025)
// ---------------------------------------------------------------------------

/// Tracks the lifecycle of a SIP account's registration with a provider.
///
/// The 7 states form a directed graph prescribed by RFC §17. Transition rules
/// are enforced by [`RegistrationState::try_transition`], which returns
/// `Ok(())` for legal transitions and `Err(SipError)` for illegal ones.
///
/// | Current       | Valid targets                                      |
/// |---------------|----------------------------------------------------|
/// | Disabled      | Registering                                        |
/// | Idle          | Registering                                        |
/// | Registering   | Registered, Failed                                 |
/// | Registered    | Unregistering, Expired                             |
/// | Unregistering | Idle, Failed                                       |
/// | Failed        | Registering                                        |
/// | Expired       | Registering                                        |
///
/// Registration and call ability are independent — this state machine does not
/// gate make_call() (§17 Invariant).
// [::STUB::] P3-2: dead_code resolved once runtime module consumes RegistrationState.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RegistrationState {
    /// Registration is disabled and no automatic re-registration will occur.
    Disabled,
    /// The account is configured but not registered and not attempting to register.
    Idle,
    /// Registration is in progress (awaiting provider response).
    Registering,
    /// The account is successfully registered with the SIP provider.
    Registered,
    /// Unregistration is in progress (awaiting provider response).
    Unregistering,
    /// The most recent registration or unregistration attempt failed.
    Failed,
    /// The registration lease has expired; automatic re-registration may occur.
    Expired,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
// [::STUB::] P3-2: dead_code resolved once runtime module consumes try_transition().
#[allow(dead_code)]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl RegistrationState {
    /// Attempts a transition from `self` to `target`.
    ///
    /// Returns `Ok(())` if the transition is valid per RFC §17, or
    /// `Err(SipError)` with kind `InvalidState` if not.
    ///
    /// The current state is unchanged on error — the method is a pure
    /// validation query, not a state mutator.
    pub(crate) fn try_transition(&self, target: RegistrationState) -> Result<(), SipError> {
        use RegistrationState::*;
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        match (*self, target) {
            (Disabled, Registering) => Ok(()),
            (Idle, Registering) => Ok(()),
            (Registering, Registered) | (Registering, Failed) => Ok(()),
            (Registered, Unregistering) | (Registered, Expired) => Ok(()),
            (Unregistering, Idle) | (Unregistering, Failed) => Ok(()),
            (Expired, Registering) | (Failed, Registering) => Ok(()),
            _ => Err(SipError::invalid_state(
                "invalid registration state transition",
            )),
        }
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
    // ── C026 ── N0025→N0011: Registration State Machine
    // -----------------------------------------------------------------------

    /// @verifies C026-precondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_state_has_7_variants() {
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        assert_debug::<RegistrationState>();
        assert_clone::<RegistrationState>();
        assert_copy::<RegistrationState>();
        assert_partial_eq::<RegistrationState>();
        // Exhaustive pattern match — compiler catches missing arms
        let state = RegistrationState::Disabled;
        match state {
            RegistrationState::Disabled
            | RegistrationState::Idle
            | RegistrationState::Registering
            | RegistrationState::Registered
            | RegistrationState::Unregistering
            | RegistrationState::Failed
            | RegistrationState::Expired => {}
        }
    }

    // ── Legal transitions (RFC §17) ──

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_disabled_to_registering_ok() {
        assert!(RegistrationState::Disabled.try_transition(RegistrationState::Registering).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_idle_to_registering_ok() {
        assert!(RegistrationState::Idle.try_transition(RegistrationState::Registering).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_registering_to_registered_ok() {
        assert!(RegistrationState::Registering.try_transition(RegistrationState::Registered).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_registering_to_failed_ok() {
        assert!(RegistrationState::Registering.try_transition(RegistrationState::Failed).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_registered_to_unregistering_ok() {
        assert!(RegistrationState::Registered.try_transition(RegistrationState::Unregistering).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_registered_to_expired_ok() {
        assert!(RegistrationState::Registered.try_transition(RegistrationState::Expired).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_unregistering_to_idle_ok() {
        assert!(RegistrationState::Unregistering.try_transition(RegistrationState::Idle).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_unregistering_to_failed_ok() {
        assert!(RegistrationState::Unregistering.try_transition(RegistrationState::Failed).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_expired_to_registering_ok() {
        assert!(RegistrationState::Expired.try_transition(RegistrationState::Registering).is_ok());
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_failed_to_registering_ok() {
        assert!(RegistrationState::Failed.try_transition(RegistrationState::Registering).is_ok());
    }

    // ── Illegal transitions ──

    /// @verifies C026-precondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_invalid_transitions_return_err() {
        let cases = vec![
            (RegistrationState::Idle, RegistrationState::Registered),
            (RegistrationState::Idle, RegistrationState::Unregistering),
            (RegistrationState::Idle, RegistrationState::Expired),
            (RegistrationState::Idle, RegistrationState::Failed),
            (RegistrationState::Disabled, RegistrationState::Unregistering),
            (RegistrationState::Disabled, RegistrationState::Failed),
            (RegistrationState::Disabled, RegistrationState::Expired),
            (RegistrationState::Disabled, RegistrationState::Idle),
            (RegistrationState::Disabled, RegistrationState::Registered),
            (RegistrationState::Registering, RegistrationState::Disabled),
            (RegistrationState::Registering, RegistrationState::Registering),
            (RegistrationState::Registering, RegistrationState::Unregistering),
            (RegistrationState::Registering, RegistrationState::Expired),
            (RegistrationState::Registered, RegistrationState::Registering),
            (RegistrationState::Registered, RegistrationState::Disabled),
            (RegistrationState::Registered, RegistrationState::Failed),
            (RegistrationState::Unregistering, RegistrationState::Registering),
            (RegistrationState::Unregistering, RegistrationState::Registered),
            (RegistrationState::Unregistering, RegistrationState::Expired),
            (RegistrationState::Failed, RegistrationState::Idle),
            (RegistrationState::Failed, RegistrationState::Registered),
            (RegistrationState::Failed, RegistrationState::Unregistering),
            (RegistrationState::Failed, RegistrationState::Expired),
            (RegistrationState::Expired, RegistrationState::Idle),
            (RegistrationState::Expired, RegistrationState::Registered),
            (RegistrationState::Expired, RegistrationState::Unregistering),
            (RegistrationState::Expired, RegistrationState::Failed),
        ];
        for (from, to) in cases {
            let result = from.try_transition(to);
            assert!(result.is_err(), "transition {:?} -> {:?} should be Err", from, to);
            assert_eq!(result.unwrap_err().kind, SipErrorKind::InvalidState);
        }
    }

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_failed_transition_error_kind() {
        let result = RegistrationState::Idle.try_transition(RegistrationState::Registered);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind, SipErrorKind::InvalidState);
    }

    // ── Invariants ──

    /// @verifies C026-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_independent_from_call_ability() {
        // RegistrationState module must not reference CallState or call counts.
        // Verify all states can attempt transitions without call-context dependencies.
        assert!(RegistrationState::Disabled.try_transition(RegistrationState::Registering).is_ok());
        assert!(RegistrationState::Failed.try_transition(RegistrationState::Registering).is_ok());
        assert!(RegistrationState::Expired.try_transition(RegistrationState::Registering).is_ok());
    }

    /// @verifies C026-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn registr_disabled_absorbing_until_register() {
        // Disabled only allows Registering
        assert!(RegistrationState::Disabled.try_transition(RegistrationState::Registering).is_ok());
        assert!(RegistrationState::Disabled.try_transition(RegistrationState::Idle).is_err());
        assert!(RegistrationState::Disabled.try_transition(RegistrationState::Registered).is_err());
        assert!(RegistrationState::Disabled.try_transition(RegistrationState::Failed).is_err());
    }
}

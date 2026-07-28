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

use std::fmt;

/// Error returned when an invalid state transition is attempted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransitionError {
    /// The state the transition was attempted from.
    pub from: RegistrationState,
    /// The state the transition was attempted to.
    pub to: RegistrationState,
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for TransitionError {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Invalid transition: {:?} → {:?}", self.from, self.to)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl std::error::Error for TransitionError {}

/// The registration state of a SIP account.
///
/// # States (7 total)
///
/// | State | Meaning |
/// |-------|---------|
/// | `Disabled` | Registration is disabled for this account |
/// | `Idle` | Registration is enabled but not yet attempted |
/// | `Registering` | REGISTER sent, awaiting response |
/// | `Registered` | Successfully registered with a registrar |
/// | `Unregistering` | UNREGISTER sent, awaiting response |
/// | `Failed` | Last registration attempt failed |
/// | `Expired` | Registration period expired |
///
/// # Transition rules (8 total)
///
/// ```text
/// Disabled → Registering        (on register() or set_enabled(true))
/// Idle → Registering            (on explicit register)
/// Registering → Registered      (on success)
/// Registering → Failed          (on failure)
/// Registered → Unregistering    (on unregister)
/// Registered → Expired          (on expiry callback)
/// Unregistering → Idle          (on success)
/// Unregistering → Failed        (on failure)
/// Expired → Registering         (on auto re-register or manual register)
/// Failed → Registering          (on retry)
/// ```
///
/// # Invariant: Registration independent of call ability
///
/// `make_call()` is always permitted regardless of registration state.
/// A registered account is not required to place outbound calls.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationState {
    /// Registration is disabled for this account.
    Disabled,
    /// Registration is enabled but not yet attempted.
    Idle,
    /// REGISTER sent, awaiting response.
    Registering,
    /// Successfully registered with a registrar.
    Registered,
    /// UNREGISTER sent, awaiting response.
    Unregistering,
    /// Last registration attempt failed.
    Failed,
    /// Registration period expired.
    Expired,
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl RegistrationState {
    /// Transition table indexed by (from_state, to_state).
    ///
    /// Order matches discriminant order of `RegistrationState`:
    /// 0=Disabled, 1=Idle, 2=Registering, 3=Registered,
    /// 4=Unregistering, 5=Failed, 6=Expired
    const TRANSITIONS: [[bool; 7]; 7] = [
        // from\to  Dis  Idl  Reg  Rgd  Unr  Fl   Exp
        /* Disabled   */ [false, false, true, false, false, false, false],
        /* Idle      */ [false, false, true, false, false, false, false],
        /* Registering*/ [false, false, false, true, false, true, false],
        /* Registered */ [false, false, false, false, true, false, true],
        /* Unregister */ [false, true, false, false, false, true, false],
        /* Failed    */ [false, false, true, false, false, false, false],
        /* Expired   */ [false, false, true, false, false, false, false],
    ];

    /// Attempt a transition from `self` to `target`.
    ///
    /// Returns `Ok(target)` if the transition is valid according to the
    /// 8 defined rules, or `Err(TransitionError)` if the transition is invalid.
    pub fn transition(self, target: RegistrationState) -> Result<RegistrationState, TransitionError> {
        let from_idx = self as usize;
        let to_idx = target as usize;

        if Self::TRANSITIONS[from_idx][to_idx] {
            Ok(target)
        } else {
            Err(TransitionError {
                from: self,
                to: target,
            })
        }
    }

    /// Check whether a transition from `self` to `target` is valid.
    pub fn can_transition_to(self, target: RegistrationState) -> bool {
        let from_idx = self as usize;
        let to_idx = target as usize;
        Self::TRANSITIONS[from_idx][to_idx]
    }

    /// Return `true` if this state is terminal (no further meaningful transitions).
    ///
    /// Terminal states are `Failed` and `Expired` — though they allow retry
    /// via `Registering`, no automatic progression occurs from them.
    pub fn is_terminal(self) -> bool {
        matches!(self, RegistrationState::Failed | RegistrationState::Expired)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for RegistrationState {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RegistrationState::Disabled => write!(f, "Disabled"),
            RegistrationState::Idle => write!(f, "Idle"),
            RegistrationState::Registering => write!(f, "Registering"),
            RegistrationState::Registered => write!(f, "Registered"),
            RegistrationState::Unregistering => write!(f, "Unregistering"),
            RegistrationState::Failed => write!(f, "Failed"),
            RegistrationState::Expired => write!(f, "Expired"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn registration_state_has_seven_variants() {
        let states = vec![
            RegistrationState::Disabled,
            RegistrationState::Idle,
            RegistrationState::Registering,
            RegistrationState::Registered,
            RegistrationState::Unregistering,
            RegistrationState::Failed,
            RegistrationState::Expired,
        ];
        assert_eq!(states.len(), 7);
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_disabled_to_registering() {
        assert_eq!(
            RegistrationState::Disabled.transition(RegistrationState::Registering),
            Ok(RegistrationState::Registering)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_idle_to_registering() {
        assert_eq!(
            RegistrationState::Idle.transition(RegistrationState::Registering),
            Ok(RegistrationState::Registering)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_registering_to_registered() {
        assert_eq!(
            RegistrationState::Registering.transition(RegistrationState::Registered),
            Ok(RegistrationState::Registered)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_registering_to_failed() {
        assert_eq!(
            RegistrationState::Registering.transition(RegistrationState::Failed),
            Ok(RegistrationState::Failed)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_registered_to_unregistering() {
        assert_eq!(
            RegistrationState::Registered.transition(RegistrationState::Unregistering),
            Ok(RegistrationState::Unregistering)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_registered_to_expired() {
        assert_eq!(
            RegistrationState::Registered.transition(RegistrationState::Expired),
            Ok(RegistrationState::Expired)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_unregistering_to_idle() {
        assert_eq!(
            RegistrationState::Unregistering.transition(RegistrationState::Idle),
            Ok(RegistrationState::Idle)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_unregistering_to_failed() {
        assert_eq!(
            RegistrationState::Unregistering.transition(RegistrationState::Failed),
            Ok(RegistrationState::Failed)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_expired_to_registering() {
        assert_eq!(
            RegistrationState::Expired.transition(RegistrationState::Registering),
            Ok(RegistrationState::Registering)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_failed_to_registering() {
        assert_eq!(
            RegistrationState::Failed.transition(RegistrationState::Registering),
            Ok(RegistrationState::Registering)
        );
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn invalid_transitions_return_error() {
        // Test a few representative invalid transitions
        assert!(RegistrationState::Idle.transition(RegistrationState::Disabled).is_err());
        assert!(RegistrationState::Disabled.transition(RegistrationState::Idle).is_err());
        assert!(RegistrationState::Disabled.transition(RegistrationState::Unregistering).is_err());
        assert!(RegistrationState::Registered.transition(RegistrationState::Registering).is_err());
        assert!(RegistrationState::Idle.transition(RegistrationState::Registered).is_err());
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transition_error_displays_message() {
        let err = RegistrationState::Idle.transition(RegistrationState::Disabled).unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("Idle"));
        assert!(msg.contains("Disabled"));
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn can_transition_to_returns_correct_bool() {
        assert!(RegistrationState::Disabled.can_transition_to(RegistrationState::Registering));
        assert!(!RegistrationState::Disabled.can_transition_to(RegistrationState::Idle));
        assert!(!RegistrationState::Idle.can_transition_to(RegistrationState::Disabled));
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn terminal_states_are_failed_and_expired() {
        assert!(RegistrationState::Failed.is_terminal());
        assert!(RegistrationState::Expired.is_terminal());
        assert!(!RegistrationState::Disabled.is_terminal());
        assert!(!RegistrationState::Idle.is_terminal());
        assert!(!RegistrationState::Registering.is_terminal());
        assert!(!RegistrationState::Registered.is_terminal());
        assert!(!RegistrationState::Unregistering.is_terminal());
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn display_variants() {
        assert_eq!(format!("{}", RegistrationState::Disabled), "Disabled");
        assert_eq!(format!("{}", RegistrationState::Idle), "Idle");
        assert_eq!(format!("{}", RegistrationState::Registering), "Registering");
        assert_eq!(format!("{}", RegistrationState::Registered), "Registered");
        assert_eq!(format!("{}", RegistrationState::Unregistering), "Unregistering");
        assert_eq!(format!("{}", RegistrationState::Failed), "Failed");
        assert_eq!(format!("{}", RegistrationState::Expired), "Expired");
    }

    /// @verifies C026
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn traits_clone_debug_copy_eq() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_traits<T: Clone + std::fmt::Debug + Copy + PartialEq + Eq>() {}
        assert_traits::<RegistrationState>();
        assert_traits::<TransitionError>();
    }
}

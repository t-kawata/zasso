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
//   - NODE_ID=N0026:  §18 Call State Model
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0026 --hops=2)
// ============================================================================

use std::fmt;

/// Error returned when an invalid call state transition is attempted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CallTransitionError {
    /// The state the transition was attempted from.
    pub from: CallState,
    /// The state the transition was attempted to.
    pub to: CallState,
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for CallTransitionError {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Invalid call transition: {:?} → {:?}", self.from, self.to)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl std::error::Error for CallTransitionError {}

/// High-level call state model (13 states).
///
/// Covers all SIP call lifecycle phases:
/// - **Outgoing**: New → Calling → Trying → Ringing | EarlyMedia → Connecting → Active
/// - **Incoming**: New → Incoming → Connecting → Active
/// - **Active**: Active ↔ Held, Active → Transferring
/// - **Termination**: any → Disconnecting → Disconnected
/// - **Failure**: Ringing / EarlyMedia / Connecting → Failed
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallState {
    /// Initial state — call object created.
    New,
    /// Outgoing: INVITE sent, awaiting response.
    Calling,
    /// Outgoing: 100 Trying received.
    Trying,
    /// Outgoing: 180 Ringing received.
    Ringing,
    /// Outgoing: 183 Session Progress received (early media).
    EarlyMedia,
    /// Incoming call offered (INVITE received).
    Incoming,
    /// Connecting to remote party (200 OK / progress).
    Connecting,
    /// Call is active (media negotiated and flowing).
    Active,
    /// Call is held locally or remotely.
    Held,
    /// REFER sent — awaiting transfer outcome.
    Transferring,
    /// Call is being disconnected (BYE sent/received).
    Disconnecting,
    /// Call is fully disconnected.
    Disconnected,
    /// Call failed (4xx/5xx/6xx or error).
    Failed,
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl CallState {
    /// Transition table indexed by (from_state, to_state).
    ///
    /// Order: 0=New, 1=Calling, 2=Trying, 3=Ringing, 4=EarlyMedia,
    ///        5=Incoming, 6=Connecting, 7=Active, 8=Held, 9=Transferring,
    ///        10=Disconnecting, 11=Disconnected, 12=Failed
    const TRANSITIONS: [[bool; 13]; 13] = [
        // New → Calling (outgoing) or → Incoming (incoming)
        /* New      */ [false, true, false, false, false, true, false, false, false, false, false, false, false],
        /* Calling  */ [false, false, true, false, false, false, false, false, false, false, false, false, false],
        /* Trying   */ [false, false, false, true, true, false, false, false, false, false, false, false, false],
        /* Ringing  */ [false, false, false, false, false, false, true, false, false, false, false, false, true],
        /* EarlyMedia*/[false, false, false, false, false, false, true, false, false, false, false, false, true],
        /* Incoming */ [false, false, false, false, false, false, true, false, false, false, false, false, false],
        /* Connect  */ [false, false, false, false, false, false, false, true, false, false, false, false, true],
        /* Active   */ [false, false, false, false, false, false, false, false, true, true, true, false, false],
        /* Held     */ [false, false, false, false, false, false, false, true, false, false, true, false, false],
        /* Transfer */ [false, false, false, false, false, false, false, true, false, false, true, false, false],
        /* Discon   */ [false, false, false, false, false, false, false, false, false, false, false, true, false],
        /* Disconned*/ [false, false, false, false, false, false, false, false, false, false, false, false, false],
        /* Failed   */ [false, false, false, false, false, false, false, false, false, false, false, false, false],
    ];

    /// Attempt a transition from `self` to `target`.
    ///
    /// Returns `Ok(target)` if the transition is valid, or
    /// `Err(CallTransitionError)` if the transition is invalid.
    pub fn transition(self, target: CallState) -> Result<CallState, CallTransitionError> {
        let from_idx = self as usize;
        let to_idx = target as usize;

        if Self::TRANSITIONS[from_idx][to_idx] {
            Ok(target)
        } else {
            Err(CallTransitionError {
                from: self,
                to: target,
            })
        }
    }

    /// Check whether a transition from `self` to `target` is valid.
    pub fn can_transition_to(self, target: CallState) -> bool {
        let from_idx = self as usize;
        let to_idx = target as usize;
        Self::TRANSITIONS[from_idx][to_idx]
    }

    /// Return `true` if this state is terminal (no further transitions possible).
    pub fn is_terminal(self) -> bool {
        matches!(self, CallState::Disconnected | CallState::Failed)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for CallState {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CallState::New => write!(f, "New"),
            CallState::Calling => write!(f, "Calling"),
            CallState::Trying => write!(f, "Trying"),
            CallState::Ringing => write!(f, "Ringing"),
            CallState::EarlyMedia => write!(f, "EarlyMedia"),
            CallState::Incoming => write!(f, "Incoming"),
            CallState::Connecting => write!(f, "Connecting"),
            CallState::Active => write!(f, "Active"),
            CallState::Held => write!(f, "Held"),
            CallState::Transferring => write!(f, "Transferring"),
            CallState::Disconnecting => write!(f, "Disconnecting"),
            CallState::Disconnected => write!(f, "Disconnected"),
            CallState::Failed => write!(f, "Failed"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C027
    /// @verifies C028
    /// @verifies C032
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_state_has_thirteen_variants() {
        let all: Vec<CallState> = vec![
            CallState::New,
            CallState::Calling,
            CallState::Trying,
            CallState::Ringing,
            CallState::EarlyMedia,
            CallState::Incoming,
            CallState::Connecting,
            CallState::Active,
            CallState::Held,
            CallState::Transferring,
            CallState::Disconnecting,
            CallState::Disconnected,
            CallState::Failed,
        ];
        assert_eq!(all.len(), 13);
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn outgoing_path_new_to_calling_to_trying_to_ringing_to_connecting_to_active() {
        assert!(CallState::New.transition(CallState::Calling).is_ok());
        assert!(CallState::Calling.transition(CallState::Trying).is_ok());
        assert!(CallState::Trying.transition(CallState::Ringing).is_ok());
        assert!(CallState::Ringing.transition(CallState::Connecting).is_ok());
        assert!(CallState::Connecting.transition(CallState::Active).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn outgoing_early_media_path() {
        assert!(CallState::Trying.transition(CallState::EarlyMedia).is_ok());
        assert!(CallState::EarlyMedia.transition(CallState::Connecting).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn incoming_path_new_to_incoming_to_connecting_to_active() {
        assert!(CallState::New.transition(CallState::Incoming).is_ok());
        assert!(CallState::Incoming.transition(CallState::Connecting).is_ok());
        assert!(CallState::Connecting.transition(CallState::Active).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn hold_unhold_cycle() {
        assert!(CallState::Active.transition(CallState::Held).is_ok());
        assert!(CallState::Held.transition(CallState::Active).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transfer_success_path() {
        assert!(CallState::Active.transition(CallState::Transferring).is_ok());
        assert!(CallState::Transferring.transition(CallState::Active).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transfer_failure_path() {
        assert!(CallState::Active.transition(CallState::Transferring).is_ok());
        assert!(CallState::Transferring.transition(CallState::Disconnecting).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn termination_path() {
        assert!(CallState::Active.transition(CallState::Disconnecting).is_ok());
        assert!(CallState::Disconnecting.transition(CallState::Disconnected).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn failure_path_from_ringing() {
        assert!(CallState::Ringing.transition(CallState::Failed).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn failure_path_from_early_media() {
        assert!(CallState::EarlyMedia.transition(CallState::Failed).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn failure_path_from_connecting() {
        assert!(CallState::Connecting.transition(CallState::Failed).is_ok());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn invalid_transition_new_to_active() {
        assert!(CallState::New.transition(CallState::Active).is_err());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn invalid_transition_calling_to_incoming() {
        assert!(CallState::Calling.transition(CallState::Incoming).is_err());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn invalid_transition_held_to_calling() {
        assert!(CallState::Held.transition(CallState::Calling).is_err());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn terminal_states() {
        assert!(CallState::Disconnected.is_terminal());
        assert!(CallState::Failed.is_terminal());
        assert!(!CallState::Active.is_terminal());
        assert!(!CallState::New.is_terminal());
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn display_variants() {
        assert_eq!(format!("{}", CallState::New), "New");
        assert_eq!(format!("{}", CallState::Calling), "Calling");
        assert_eq!(format!("{}", CallState::Trying), "Trying");
        assert_eq!(format!("{}", CallState::Ringing), "Ringing");
        assert_eq!(format!("{}", CallState::EarlyMedia), "EarlyMedia");
        assert_eq!(format!("{}", CallState::Incoming), "Incoming");
        assert_eq!(format!("{}", CallState::Connecting), "Connecting");
        assert_eq!(format!("{}", CallState::Active), "Active");
        assert_eq!(format!("{}", CallState::Held), "Held");
        assert_eq!(format!("{}", CallState::Transferring), "Transferring");
        assert_eq!(format!("{}", CallState::Disconnecting), "Disconnecting");
        assert_eq!(format!("{}", CallState::Disconnected), "Disconnected");
        assert_eq!(format!("{}", CallState::Failed), "Failed");
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn error_displays_message() {
        let err = CallState::New.transition(CallState::Active).unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("New"));
        assert!(msg.contains("Active"));
    }

    /// @verifies C027
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn traits_clone_debug_copy_eq() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_traits<T: Clone + std::fmt::Debug + Copy + PartialEq + Eq>() {}
        assert_traits::<CallState>();
        assert_traits::<CallTransitionError>();
    }
}

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
        write!(
            f,
            "Invalid call transition: {:?} → {:?}",
            self.from, self.to
        )
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
        /* New      */
        [
            false, true, false, false, false, true, false, false, false, false, false, false, false,
        ],
        /* Calling  */
        [
            false, false, true, false, false, false, false, false, false, false, false, false,
            false,
        ],
        /* Trying   */
        [
            false, false, false, true, true, false, false, false, false, false, false, false, false,
        ],
        /* Ringing  */
        [
            false, false, false, false, false, false, true, false, false, false, false, false, true,
        ],
        /* EarlyMedia*/
        [
            false, false, false, false, false, false, true, false, false, false, false, false, true,
        ],
        /* Incoming */
        [
            false, false, false, false, false, false, true, false, false, false, false, false,
            false,
        ],
        /* Connect  */
        [
            false, false, false, false, false, false, false, true, false, false, false, false, true,
        ],
        /* Active   */
        [
            false, false, false, false, false, false, false, false, true, true, true, false, false,
        ],
        /* Held     */
        [
            false, false, false, false, false, false, false, true, false, false, true, false, false,
        ],
        /* Transfer */
        [
            false, false, false, false, false, false, false, true, false, false, true, false, false,
        ],
        /* Discon   */
        [
            false, false, false, false, false, false, false, false, false, false, false, true,
            false,
        ],
        /* Disconned*/
        [
            false, false, false, false, false, false, false, false, false, false, false, false,
            false,
        ],
        /* Failed   */
        [
            false, false, false, false, false, false, false, false, false, false, false, false,
            false,
        ],
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
        assert!(CallState::EarlyMedia
            .transition(CallState::Connecting)
            .is_ok());
    }

    /// @verifies C027
    #[test]
    // [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn incoming_path_new_to_incoming_to_connecting_to_active() {
        assert!(CallState::New.transition(CallState::Incoming).is_ok());
        assert!(CallState::Incoming
            .transition(CallState::Connecting)
            .is_ok());
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
        assert!(CallState::Active
            .transition(CallState::Transferring)
            .is_ok());
        assert!(CallState::Transferring
            .transition(CallState::Active)
            .is_ok());
    }

    /// @verifies C027
    #[test]
    // [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transfer_failure_path() {
        assert!(CallState::Active
            .transition(CallState::Transferring)
            .is_ok());
        assert!(CallState::Transferring
            .transition(CallState::Disconnecting)
            .is_ok());
    }

    /// @verifies C027
    #[test]
    // [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn termination_path() {
        assert!(CallState::Active
            .transition(CallState::Disconnecting)
            .is_ok());
        assert!(CallState::Disconnecting
            .transition(CallState::Disconnected)
            .is_ok());
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
// [::TICKET::] P4-1, P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-1|P8-3) --for-spec --no-implementation-order`.
        fn assert_traits<T: Clone + std::fmt::Debug + Copy + PartialEq + Eq>() {}
        assert_traits::<CallState>();
        assert_traits::<CallTransitionError>();
    }

    /// @verifies C027
    /// All 13 variants in discriminant order — used to enumerate the full 13x13 matrix.
    const ALL_STATES: [CallState; 13] = [
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

    /// @verifies C027
    /// The 20 RFC §18.1 DAG edges as an executable copy of the transition diagram.
    const EXPECTED_EDGES: [(CallState, CallState); 20] = [
        (CallState::New, CallState::Calling),
        (CallState::New, CallState::Incoming),
        (CallState::Calling, CallState::Trying),
        (CallState::Trying, CallState::Ringing),
        (CallState::Trying, CallState::EarlyMedia),
        (CallState::Ringing, CallState::Connecting),
        (CallState::Ringing, CallState::Failed),
        (CallState::EarlyMedia, CallState::Connecting),
        (CallState::EarlyMedia, CallState::Failed),
        (CallState::Incoming, CallState::Connecting),
        (CallState::Connecting, CallState::Active),
        (CallState::Connecting, CallState::Failed),
        (CallState::Active, CallState::Held),
        (CallState::Active, CallState::Transferring),
        (CallState::Active, CallState::Disconnecting),
        (CallState::Held, CallState::Active),
        (CallState::Held, CallState::Disconnecting),
        (CallState::Transferring, CallState::Active),
        (CallState::Transferring, CallState::Disconnecting),
        (CallState::Disconnecting, CallState::Disconnected),
    ];

    /// @verifies C027
    /// O-003 — Exhaustive 13x13 transition-table check: exactly the 20 RFC §18.1
    /// DAG edges are valid, all other 149 (from,to) pairs are rejected. A spurious
    /// extra true cell (e.g. New->Active, Held->Calling, Disconnected->New) fails
    /// this suite.
    #[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
    fn transition_table_has_no_implicit_edges() {
        for from in ALL_STATES {
            for to in ALL_STATES {
                let is_expected = EXPECTED_EDGES.contains(&(from, to));
                if is_expected {
                    assert_eq!(from.transition(to), Ok(to), "missing valid edge {from:?}->{to:?}");
                } else {
                    assert!(
                        from.transition(to).is_err(),
                        "spurious implicit edge {from:?}->{to:?}"
                    );
                }
            }
        }
    }

    /// @verifies C027
    /// O-003 — `can_transition_to()` must agree with `transition()` on every cell
    /// of the 13x13 matrix. This predicate was previously completely untested.
    #[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
    fn can_transition_to_matches_transition_table() {
        for from in ALL_STATES {
            for to in ALL_STATES {
                let expected = EXPECTED_EDGES.contains(&(from, to));
                assert_eq!(
                    from.can_transition_to(to),
                    expected,
                    "can_transition_to({from:?}, {to:?}) disagrees with transition()"
                );
            }
        }
    }

    /// @verifies C027
    /// O-003 — Termination edge while held: Held->Disconnecting->Disconnected is a
    /// valid path (BYE/hangup during a held call). The prior termination_path test
    /// only covered Active->Disconnecting->Disconnected, so this edge was untested.
    #[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
    fn held_to_disconnecting_termination_edge() {
        assert_eq!(
            CallState::Held.transition(CallState::Disconnecting),
            Ok(CallState::Disconnecting)
        );
        assert_eq!(
            CallState::Disconnecting.transition(CallState::Disconnected),
            Ok(CallState::Disconnected)
        );
    }

    /// @verifies C027
    /// Boundary — terminal states Disconnected and Failed are absorbing: they have
    /// no self-loop and no outgoing edge (their transition rows are all-false).
    #[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
    fn terminal_states_are_absorbing() {
        for from in [CallState::Disconnected, CallState::Failed] {
            assert!(from.is_terminal());
            for to in ALL_STATES {
                assert!(
                    from.transition(to).is_err(),
                    "terminal {from:?} must have no outgoing edge to {to:?}"
                );
            }
        }
        for from in ALL_STATES {
            let is_terminal = matches!(from, CallState::Disconnected | CallState::Failed);
            assert_eq!(from.is_terminal(), is_terminal, "is_terminal({from:?})");
        }
    }

    /// @verifies C027
    /// Reachability — every non-terminal state has a valid path to Disconnected or
    /// Failed within the 20-edge DAG. This is the "complete DAG, no dead cycles"
    /// invariant asserted by construction.
    #[test]
// [::TICKET::] P8-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-3 --for-spec --no-implementation-order`.
    fn all_non_terminal_states_reach_terminal() {
        for start in ALL_STATES {
            if start.is_terminal() {
                continue;
            }
            let mut stack = vec![start];
            let mut seen: Vec<CallState> = Vec::new();
            let mut reached_terminal = false;
            while let Some(state) = stack.pop() {
                if state.is_terminal() {
                    reached_terminal = true;
                    break;
                }
                if seen.contains(&state) {
                    continue;
                }
                seen.push(state);
                for (from, to) in EXPECTED_EDGES {
                    if from == state {
                        stack.push(to);
                    }
                }
            }
            assert!(
                reached_terminal,
                "non-terminal state {start:?} cannot reach Disconnected or Failed"
            );
        }
    }
}

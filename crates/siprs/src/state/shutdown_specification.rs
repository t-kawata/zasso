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
//   - NODE_ID=N0043:  §32 Shutdown Specification
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0043 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::sync::atomic::{AtomicBool, Ordering};

use crate::concurrency_contexts::command_serialization::RuntimeCommand;
use crate::error::SipError;

// ---------------------------------------------------------------------------
// ShutdownState — 3-state shutdown lifecycle (§32 / N0043)
// ---------------------------------------------------------------------------

/// Tracks the progress of client shutdown through three ordered phases.
///
/// Transitions are forward-only: `Idle → ShuttingDown → ShutdownComplete`.
/// `ShutdownComplete` is terminal (further `advance()` is a no-op).
// [::STUB::] P3-2: dead_code resolved once runtime module consumes ShutdownState.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ShutdownState {
    /// No shutdown in progress; normal operation.
    Idle,
    /// Shutdown sequence has started (BYE/CANCEL, unregister, drain, destroy).
    ShuttingDown,
    /// Shutdown has completed (pjsua_destroy called).
    ShutdownComplete,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
// [::STUB::] P3-2: dead_code resolved once runtime module consumes ShutdownState.
#[allow(dead_code)]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl ShutdownState {
    /// Advances the state forward one step.
    ///
    /// - `Idle → ShuttingDown`
    /// - `ShuttingDown → ShutdownComplete`
    /// - `ShutdownComplete → ShutdownComplete` (terminal, no-op)
    pub(crate) fn advance(self) -> ShutdownState {
        match self {
            ShutdownState::Idle => ShutdownState::ShuttingDown,
            ShutdownState::ShuttingDown => ShutdownState::ShutdownComplete,
            ShutdownState::ShutdownComplete => ShutdownState::ShutdownComplete,
        }
    }
}

// ---------------------------------------------------------------------------
// ShutdownSpecification — stateful shutdown controller (§32 / N0043)
// ---------------------------------------------------------------------------

/// Manages the idempotent shutdown sequence and command routing during shutdown.
///
/// ## Idempotent guard
///
/// An `AtomicBool` ensures that `begin_shutdown()` only transitions from `Idle`
/// to `ShuttingDown` once. Subsequent calls return `Ok(())` without re-execution.
///
/// ## Cancellation safety
///
/// The guard is independent of any calling task — caller cancellation after
/// `begin_shutdown()` does not interrupt the reactor-side shutdown sequence.
///
/// ## M20 command routing (§32 / C045)
///
/// During shutdown, read-only commands (`GetAccountInfo`) are permitted, while
/// media-mutating commands (`MakeCall`, `Hangup`, `Hold`, etc.) are rejected.
/// This is enforced by `should_allow_command()`.
// [::STUB::] P3-2: dead_code resolved once runtime module consumes ShutdownSpecification.
#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct ShutdownSpecification {
    /// Atomic flag preventing re-entry into the shutdown sequence.
    shutdown_started: AtomicBool,
    /// Current state of the shutdown process.
    state: std::sync::Mutex<ShutdownState>,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
// [::STUB::] P3-2: dead_code resolved once runtime module consumes ShutdownSpecification.
#[allow(dead_code)]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl ShutdownSpecification {
    /// Creates a new shutdown specification in the `Idle` state.
    pub(crate) fn new() -> Self {
        ShutdownSpecification {
            shutdown_started: AtomicBool::new(false),
            state: std::sync::Mutex::new(ShutdownState::Idle),
        }
    }

    /// Returns the current shutdown state.
    pub(crate) fn state(&self) -> ShutdownState {
        *self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Returns `true` when shutdown has been initiated (state != Idle).
    pub(crate) fn is_shutting_down(&self) -> bool {
        self.shutdown_started.load(Ordering::SeqCst)
    }

    /// Begins the shutdown sequence.
    ///
    /// Idempotent — the first call transitions to `ShuttingDown`; subsequent
    /// calls return `Ok(())` without re-executing. Cancellation safety: the
    /// atomic guard ensures the reactor state is updated atomically.
    pub(crate) fn begin_shutdown(&self) -> Result<(), SipError> {
        if self.shutdown_started.swap(true, Ordering::SeqCst) {
            // Already shutting down — idempotent, return Ok.
            return Ok(());
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *state = state.advance();
        Ok(())
    }

    /// Marks the shutdown sequence as complete.
    ///
    /// Advances `ShuttingDown → ShutdownComplete`. No-op if already complete.
    pub(crate) fn mark_complete(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *state = state.advance();
    }

    /// Returns `true` if the given `RuntimeCommand` is permitted during shutdown.
    ///
    /// Only read-only commands (`GetAccountInfo`) are allowed; all commands that
    /// would mutate call state or media resources are rejected. This implements
    /// the M20 routing policy (§32 / C045).
    pub(crate) fn should_allow_command(&self, cmd: &RuntimeCommand) -> bool {
        matches!(cmd, RuntimeCommand::GetAccountInfo { .. })
    }

    /// Returns a `SipError` representing a command rejected during shutdown.
    ///
    /// The error kind is `InvalidState` and the message includes "shutting down"
    /// for downstream matching.
    pub(crate) fn reject_command_message() -> SipError {
        SipError::invalid_state("shutting down: command rejected")
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::concurrency_contexts::command_serialization::ReplySender;
    use crate::error::SipErrorKind;

    // -----------------------------------------------------------------------
    // ── C044 ── N0043→N0001: Shutdown Specification
    // -----------------------------------------------------------------------

    /// @verifies C044-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_state_transitions_forward_only() {
        let mut state = ShutdownState::Idle;
        state = state.advance();
        assert_eq!(state, ShutdownState::ShuttingDown);
        state = state.advance();
        assert_eq!(state, ShutdownState::ShutdownComplete);
        state = state.advance();
        assert_eq!(state, ShutdownState::ShutdownComplete);
    }

    /// @verifies C044-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_spec_starts_at_idle() {
        let spec = ShutdownSpecification::new();
        assert_eq!(spec.state(), ShutdownState::Idle);
        assert!(!spec.is_shutting_down());
    }

    /// @verifies C044-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_begin_transitions_to_shutting_down() {
        let spec = ShutdownSpecification::new();
        assert!(spec.begin_shutdown().is_ok());
        assert!(spec.is_shutting_down());
        assert_eq!(spec.state(), ShutdownState::ShuttingDown);
    }

    /// @verifies C044-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_is_idempotent() {
        let spec = ShutdownSpecification::new();
        assert!(spec.begin_shutdown().is_ok());
        assert!(spec.is_shutting_down());
        // Second call also returns Ok(())
        let second = spec.begin_shutdown();
        assert!(second.is_ok());
        // State remains ShuttingDown (not advanced again)
        assert_eq!(spec.state(), ShutdownState::ShuttingDown);
    }

    /// @verifies C044-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_mark_complete() {
        let spec = ShutdownSpecification::new();
        spec.begin_shutdown().unwrap();
        spec.mark_complete();
        assert_eq!(spec.state(), ShutdownState::ShutdownComplete);
        assert!(spec.is_shutting_down());
    }

    // -----------------------------------------------------------------------
    // ── C045 ── N0044→N0043 (inbound): M20 command routing during shutdown
    // -----------------------------------------------------------------------

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_get_account_info_permitted() {
        use crate::model::id_design_newtype::AccountId;

        let spec = ShutdownSpecification::new();
        spec.begin_shutdown().unwrap();
        // GetAccountInfo is explicitly permitted during shutdown (read-only)
        let cmd = RuntimeCommand::GetAccountInfo {
            account_id: AccountId::from_u64(1).unwrap(),
            reply: ReplySender::new(),
        };
        assert!(spec.should_allow_command(&cmd));
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_non_readonly_commands_rejected() {
        use crate::model::id_design_newtype::{AccountId, CallId};

        let spec = ShutdownSpecification::new();
        spec.begin_shutdown().unwrap();
        // Non-read-only commands (e.g. MakeCall, Hangup, Hold) are rejected
        let make_call = RuntimeCommand::MakeCall {
            account_id: AccountId::from_u64(1).unwrap(),
            request: (),
            reply: ReplySender::new(),
        };
        assert!(!spec.should_allow_command(&make_call));
        let hangup = RuntimeCommand::Hangup {
            call_id: CallId::from_u64(1).unwrap(),
            reason: (),
            reply: ReplySender::new(),
        };
        assert!(!spec.should_allow_command(&hangup));
        let hold = RuntimeCommand::Hold {
            call_id: CallId::from_u64(1).unwrap(),
            reply: ReplySender::new(),
        };
        assert!(!spec.should_allow_command(&hold));
    }

    /// @verifies C045-invariant
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn shutdown_reject_command_returns_invalid_state() {
        let err = ShutdownSpecification::reject_command_message();
        assert!(err.message.contains("shutting down") || err.message.contains("shutdown"));
        assert_eq!(err.kind, SipErrorKind::InvalidState);
    }
}

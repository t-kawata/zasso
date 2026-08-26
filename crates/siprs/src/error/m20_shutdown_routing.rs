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
//   - NODE_ID=N0044:  §32 M20 Shutdown Command Routing
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0044 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::error::SipError;
use crate::error::SipErrorKind;
use crate::runtime::command::RuntimeCommand;

/// Error message carried by `Reject` actions during shutdown. Shared by the
/// media-command arms and the catch-all so the diagnostic is consistent.
const SHUTDOWN_REJECT_MESSAGE: &str = "shutting down";

// ---------------------------------------------------------------------------
// ShutdownCommandAction — routing result for commands during shutdown
// ---------------------------------------------------------------------------

/// The action to take for a `RuntimeCommand` during shutdown.
///
/// Returned by `ShutdownCommandRouter::classify()` to inform the reactor
/// whether a command should be permitted (and executed) or rejected.
#[derive(Debug, Clone)]
pub enum ShutdownCommandAction {
    /// The command is permitted during shutdown — forward for execution.
    Permit,
    /// The command is rejected during shutdown — the error is handed to the caller.
    Reject(SipError),
}

// ---------------------------------------------------------------------------
// ShutdownCommandRouter — pure shutdown routing
// ---------------------------------------------------------------------------

/// Pure classifier for `RuntimeCommand` variants during shutdown.
///
/// Provides a single static method `classify()` that returns the appropriate
/// `ShutdownCommandAction` based on the command variant and shutdown state.
/// The classification is invariant per variant:
/// - `GetAccountInfo` — always Permitted (read-only state check)
/// - `ConfConnect`, `ConfDisconnect` — always Rejected (media mutation)
/// - All other commands — Rejected with InvalidState
///
/// This classifier is stateless and has no side effects, making it fully
/// testable without a running reactor.
pub struct ShutdownCommandRouter;

// [::TICKET::] P1-1, P6-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P6-3) --for-spec --no-implementation-order`.
impl ShutdownCommandRouter {
    /// Classify a `RuntimeCommand` during the shutdown phase.
    ///
    /// When `is_shutting_down` is `false`, the command is always permitted
    /// (normal operation). When `true`, the command is classified according
    /// to the M20 shutdown routing rules.
    pub fn classify(cmd: &RuntimeCommand, is_shutting_down: bool) -> ShutdownCommandAction {
        if !is_shutting_down {
            return ShutdownCommandAction::Permit;
        }

        match cmd {
            RuntimeCommand::GetAccountInfo { .. } => ShutdownCommandAction::Permit,
            RuntimeCommand::ConfConnect { .. } | RuntimeCommand::ConfDisconnect { .. } => {
                ShutdownCommandAction::Reject(SipError::new(
                    SipErrorKind::InvalidState,
                    SHUTDOWN_REJECT_MESSAGE,
                ))
            }
            _ => ShutdownCommandAction::Reject(SipError::new(
                SipErrorKind::InvalidState,
                SHUTDOWN_REJECT_MESSAGE,
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — TDD Red: failing → Green: passing
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::command::Reply;

    /// Helper to build a `RuntimeCommand::GetAccountInfo` for testing.
    // [::TICKET::] P1-1, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P10-4) --for-spec --no-implementation-order`.
    fn make_get_account_info() -> RuntimeCommand {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        RuntimeCommand::GetAccountInfo {
            native_acc_id: 1,
            reply: Reply::new(tx),
        }
    }

    /// Helper to build a `RuntimeCommand::ConfConnect` for testing.
    // [::TICKET::] P1-1, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P10-4) --for-spec --no-implementation-order`.
    fn make_conf_connect() -> RuntimeCommand {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        RuntimeCommand::ConfConnect {
            call_id: 42,
            reply: Reply::new(tx),
        }
    }

    /// Helper to build a `RuntimeCommand::ConfDisconnect` for testing.
    // [::TICKET::] P1-1, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P10-4) --for-spec --no-implementation-order`.
    fn make_conf_disconnect() -> RuntimeCommand {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        RuntimeCommand::ConfDisconnect {
            call_id: 7,
            reply: Reply::new(tx),
        }
    }

    /// Helper to build a non-M20 command (e.g., Hangup) for testing.
    // [::TICKET::] P1-1, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P10-4) --for-spec --no-implementation-order`.
    // [::TICKET::] P15-6: RuntimeCommand::Hangup now carries a reason field.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn make_other_command() -> RuntimeCommand {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        RuntimeCommand::Hangup {
            call_id: 1,
            reason: crate::call::HangupReason::LocalUser,
            reply: Reply::new(tx),
        }
    }

    // ── C045-Pre: Precondition — shutdown started, command submitted

    #[test]
    // @verifies C045
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_get_account_info_permitted_during_shutdown() {
        let cmd = make_get_account_info();
        let action = ShutdownCommandRouter::classify(&cmd, true);
        assert!(matches!(action, ShutdownCommandAction::Permit));
    }

    #[test]
    // @verifies C045
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_conf_connect_rejected_during_shutdown() {
        let cmd = make_conf_connect();
        let action = ShutdownCommandRouter::classify(&cmd, true);
        match &action {
            ShutdownCommandAction::Reject(err) => {
                assert_eq!(err.kind, SipErrorKind::InvalidState);
                assert!(err.message.contains("shutting down"));
            }
            _ => panic!("expected Reject for ConfConnect during shutdown"),
        }
    }

    #[test]
    // @verifies C045
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_conf_disconnect_rejected_during_shutdown() {
        let cmd = make_conf_disconnect();
        let action = ShutdownCommandRouter::classify(&cmd, true);
        match &action {
            ShutdownCommandAction::Reject(err) => {
                assert_eq!(err.kind, SipErrorKind::InvalidState);
                assert!(err.message.contains("shutting down"));
            }
            _ => panic!("expected Reject for ConfDisconnect during shutdown"),
        }
    }

    // ── C045-Inv: Invariant — GetAccountInfo always Permitted, media always Rejected

    #[test]
    // @verifies C045
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_invariant_get_account_info_always_permitted() {
        let cmd = make_get_account_info();
        let action = ShutdownCommandRouter::classify(&cmd, true);
        assert!(matches!(action, ShutdownCommandAction::Permit));
    }

    #[test]
    // @verifies C045
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_invariant_media_always_rejected() {
        for cmd in &[make_conf_connect(), make_conf_disconnect()] {
            let action = ShutdownCommandRouter::classify(cmd, true);
            assert!(
                matches!(&action, ShutdownCommandAction::Reject(e) if e.kind == SipErrorKind::InvalidState),
                "Media commands must be rejected during shutdown"
            );
        }
    }

    // ── Normal: non-shutdown operation

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_all_permitted_when_not_shutting_down() {
        let cmds: [RuntimeCommand; 3] = [
            make_get_account_info(),
            make_conf_connect(),
            make_conf_disconnect(),
        ];
        for cmd in &cmds {
            let action = ShutdownCommandRouter::classify(cmd, false);
            assert!(
                matches!(action, ShutdownCommandAction::Permit),
                "command must be permitted when not shutting down"
            );
        }
    }

    // ── Error: non-M20 commands during shutdown

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn classify_other_commands_rejected_during_shutdown() {
        let cmd = make_other_command();
        let action = ShutdownCommandRouter::classify(&cmd, true);
        match &action {
            ShutdownCommandAction::Reject(err) => {
                assert_eq!(err.kind, SipErrorKind::InvalidState);
                assert!(err.message.contains("shutting down"));
            }
            _ => panic!("expected Reject for non-M20 command during shutdown"),
        }
    }

    // ── Invariant: SipError is Send + Sync

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn shutdown_command_action_reject_contains_sip_error() {
        let cmd = make_conf_connect();
        let action = ShutdownCommandRouter::classify(&cmd, true);
        if let ShutdownCommandAction::Reject(err) = &action {
            // SipError properties must be accessible
            let _kind: SipErrorKind = err.kind;
            let _msg: &str = &err.message;
            let _retryable: bool = err.retryable;
        }
    }
}

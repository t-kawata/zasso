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

//! Implements M20 shutdown command routing (N0044).
//!
//! [::STUB::] P0-7/P0-8: AllowAction, Reject variant, and should_allow_during_shutdown
//! trigger dead_code until the runtime reactor module consumes them. The reactor calls
//! should_allow_during_shutdown before executing each command during shutdown.

// [::STUB::] P0-7/P0-8: Items in this module are consumed by the runtime reactor (P0-7)
// and AudioWorker (P0-8). They trigger dead_code until those modules are implemented.
#![allow(dead_code)]
//!
//! During shutdown, `RuntimeCommand` variants are dispatched as follows:
//!
//! | Variant | Behavior |
//! |---------|----------|
//! | `GetAccountInfo` | Permitted (read-only state query) |
//! | `ConfConnect` | Rejected with `InvalidState("shutting down")` (P0-8+) |
//! | `ConfDisconnect` | Rejected with `InvalidState("shutting down")` (P0-8+) |
//! | All others | Rejected with `InvalidState("shutting down")` via catch-all |
//!
//! ## Design
//!
//! `should_allow_during_shutdown` is a pure function: its output depends solely
//! on the command variant and the `is_shutting_down` flag. This makes it
//! deterministic and testable without a reactor loop.

use crate::concurrency_contexts::command_serialization::RuntimeCommand;
use crate::error::error_design_siperror::SipError;

// ---------------------------------------------------------------------------
// AllowAction — dispatch decision
// ---------------------------------------------------------------------------

/// Result of a shutdown dispatch decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AllowAction {
    /// The command is allowed to execute during shutdown.
    Execute,
    /// The command is rejected during shutdown.
    Reject,
}

// ---------------------------------------------------------------------------
// should_allow_during_shutdown — pure dispatch decision function
// ---------------------------------------------------------------------------

/// Determines whether a `RuntimeCommand` should be allowed during shutdown.
///
/// Returns `Ok(AllowAction::Execute)` for permitted commands,
/// or `Err(SipError)` with `InvalidState` for rejected commands.
///
/// When `is_shutting_down` is `false`, all commands are allowed (returns `Ok(Execute)`).
///
/// When `is_shutting_down` is `true`:
/// - `GetAccountInfo` → permitted (read-only state query)
/// - All other variants → rejected via catch-all
///
/// ## ConfConnect/ConfDisconnect
///
/// These variants are added by P0-8 (AudioWorkerTask). Until then, the catch-all
/// `_` pattern rejects them. Once the variants exist, they can be matched
/// explicitly for clearer error messages.
pub(crate) fn should_allow_during_shutdown(
    cmd: &RuntimeCommand,
    is_shutting_down: bool,
) -> Result<AllowAction, SipError> {
    if !is_shutting_down {
        return Ok(AllowAction::Execute);
    }

    match cmd {
        RuntimeCommand::GetAccountInfo { .. } => {
            // Read-only state query: permitted during shutdown to allow
            // caller to check final account state before teardown completes.
            Ok(AllowAction::Execute)
        }
        _ => Err(SipError::invalid_state("shutting down")),
    }
}

// ---------------------------------------------------------------------------
// Tests — Red Phase (TDD)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::model::id_design_newtype::AccountId;
    use crate::model::id_design_newtype::CallId;
    use super::*;
    use crate::concurrency_contexts::command_serialization::ReplySender;

    // -----------------------------------------------------------------------
    // ── C045-precondition: function is deterministic ───────────────────
    // -----------------------------------------------------------------------

    /// @verifies C045-precondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn should_allow_is_deterministic_pure_function() {
        let cmd = RuntimeCommand::Shutdown {
            reply: ReplySender::new(),
        };
        let r1 = should_allow_during_shutdown(&cmd, true);
        let r2 = should_allow_during_shutdown(&cmd, true);
        assert_eq!(format!("{:?}", r1), format!("{:?}", r2));
    }

    // -----------------------------------------------------------------------
    // ── C045-postcondition: GetAccountInfo permitted during shutdown ───
    // -----------------------------------------------------------------------

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn get_account_info_permitted_during_shutdown() {
        let cmd = RuntimeCommand::GetAccountInfo {
            account_id: AccountId::from_u64(1).unwrap(),
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_ok());
        match result {
            Ok(AllowAction::Execute) => {}
            _ => panic!("expected Execute"),
        }
    }

    // -----------------------------------------------------------------------
    // ── C045-postcondition: all other commands rejected during shutdown ─
    // -----------------------------------------------------------------------

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn shutdown_rejected_during_shutdown() {
        let cmd = RuntimeCommand::Shutdown {
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
        match result {
            Err(ref err)
                if err.kind == crate::error::error_design_siperror::SipErrorKind::InvalidState =>
            {
                assert!(
                    err.message.contains("shutting down"),
                    "Error message should contain 'shutting down', got: {}",
                    err.message
                );
            }
            _ => panic!("expected InvalidState error with shutting down message"),
        }
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn initialize_rejected_during_shutdown() {
        // [::STUB::] P0-3 (N0013): ClientConfig placeholder type used.
        let cmd = RuntimeCommand::Initialize {
            config: crate::concurrency_contexts::command_serialization::ClientConfig,
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn add_account_rejected_during_shutdown() {
        let cmd = RuntimeCommand::AddAccount {
            config: crate::concurrency_contexts::command_serialization::AccountConfig,
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn make_call_rejected_during_shutdown() {
        let cmd = RuntimeCommand::MakeCall {
            account_id: AccountId::from_u64(1).unwrap(),
            request: (),
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1, P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1|P5-1) --for-spec --no-implementation-order`.
    fn hangup_rejected_during_shutdown() {
        // [::STUB::] P5-1: HangupCall replaces Hangup. Using placeholder reason.
        let cmd = RuntimeCommand::HangupCall {
            call_id: CallId::from_u64(1).unwrap(),
            reason: crate::api::audio_subscribe_bp::HangupReason::Normal,
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn send_dtmf_rejected_during_shutdown() {
        let cmd = RuntimeCommand::SendDtmf {
            call_id: CallId::from_u64(1).unwrap(),
            digits: "123".into(),
            method: crate::api::m20_dtmfsent_twophase::DtmfMethod::Inband,
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn remove_account_rejected_during_shutdown() {
        let cmd = RuntimeCommand::RemoveAccount {
            account_id: AccountId::from_u64(1).unwrap(),
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn set_registration_rejected_during_shutdown() {
        let cmd = RuntimeCommand::SetRegistration {
            account_id: AccountId::from_u64(1).unwrap(),
            enabled: true,
            reply: ReplySender::new(),
        };
        let result = should_allow_during_shutdown(&cmd, true);
        assert!(result.is_err());
    }

    // Note: ConfConnect and ConfDisconnect variants will be added by P0-8
    // (AudioWorkerTask). Once available, add the following tests:
    //
    // ```rust
    // fn conf_connect_rejected_during_shutdown() { ... }
    // fn conf_disconnect_rejected_during_shutdown() { ... }
    // ```

    // -----------------------------------------------------------------------
    // ── C045-postcondition: normal dispatch when not shutting down ─────
    // -----------------------------------------------------------------------

    /// @verifies C045-postcondition
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn all_commands_allowed_when_not_shutting_down() {
        let cmds: Vec<RuntimeCommand> = vec![
            RuntimeCommand::GetAccountInfo {
                account_id: AccountId::from_u64(1).unwrap(),
                reply: ReplySender::new(),
            },
            RuntimeCommand::Shutdown {
                reply: ReplySender::new(),
            },
            RuntimeCommand::Hold {
                call_id: CallId::from_u64(1).unwrap(),
                reply: ReplySender::new(),
            },
            RuntimeCommand::Unhold {
                call_id: CallId::from_u64(1).unwrap(),
                reply: ReplySender::new(),
            },
        ];
        for cmd in &cmds {
            let result = should_allow_during_shutdown(cmd, false);
            assert!(
                result.is_ok(),
                "Expected command to be allowed when not shutting down"
            );
            if let Ok(action) = result {
                assert_eq!(action, AllowAction::Execute);
            }
        }
    }

    // -----------------------------------------------------------------------
    // ── C045-invariant: deterministic dispatch ─────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C045-invariant
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn dispatch_decision_unchanged_for_identical_input() {
        let cmd = RuntimeCommand::GetAccountInfo {
            account_id: AccountId::from_u64(42).unwrap(),
            reply: ReplySender::new(),
        };
        let result_a = should_allow_during_shutdown(&cmd, true);
        let result_b = should_allow_during_shutdown(&cmd, true);
        assert_eq!(format!("{:?}", result_a), format!("{:?}", result_b));

        let cmd2 = RuntimeCommand::Hold {
            call_id: CallId::from_u64(7).unwrap(),
            reply: ReplySender::new(),
        };
        let result_a2 = should_allow_during_shutdown(&cmd2, true);
        let result_b2 = should_allow_during_shutdown(&cmd2, true);
        assert_eq!(format!("{:?}", result_a2), format!("{:?}", result_b2));
    }

    /// @verifies C045-invariant
    #[test]
// [::TICKET::] P1-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P4-1) --for-spec --no-implementation-order`.
    fn no_panic_for_any_variant_during_shutdown() {
        // All current RuntimeCommand variants must not panic during dispatch
        let cmds: Vec<RuntimeCommand> = vec![
            RuntimeCommand::Shutdown {
                reply: ReplySender::new(),
            },
            RuntimeCommand::GetAccountInfo {
                account_id: AccountId::from_u64(1).unwrap(),
                reply: ReplySender::new(),
            },
            RuntimeCommand::Hold {
                call_id: CallId::from_u64(1).unwrap(),
                reply: ReplySender::new(),
            },
            RuntimeCommand::Unhold {
                call_id: CallId::from_u64(1).unwrap(),
                reply: ReplySender::new(),
            },
        ];
        for cmd in &cmds {
            let _ = should_allow_during_shutdown(cmd, true);
        }
    }
}

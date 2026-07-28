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
//   - NODE_ID=N0010:  §7.2 RuntimeCommand & Command Serialization
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0010 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use tokio::sync::oneshot;

// ============================================================================
// Future-type placeholders
// ============================================================================
// These types are defined by downstream tickets. The definitions here are
// minimal stubs that allow RuntimeCommand to compile until the owning tickets
// replace them with real implementations.

// [::STUB::] P0-5: N0016 — SipError type for Result reply channels.
// Resolve by replacing with `use crate::error::SipError;` once P0-5 implements it.
// The #[allow(dead_code)] is removed once P0-5's SipError replaces this stub and
// downstream consumers (P0-7 reactor) construct error values.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub(crate) struct SipError(pub(crate) String);

// [::STUB::] P0-7: N0013 — ClientConfig for Initialize variant.
// Resolve by replacing with `use crate::config::ClientConfig;` once P0-7 implements it.
#[derive(Debug, Clone)]
pub(crate) struct ClientConfig;

// [::STUB::] P0-8: N0014 — AccountConfig for AddAccount variant.
// Resolve by replacing with `use crate::config::AccountConfig;` once P0-8 implements it.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub(crate) struct AccountConfig;

// [::STUB::] P0-9: N0012 — AccountId newtype for account operations.
// Resolve by replacing with `use crate::model::AccountId;` once P0-9 implements it.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct AccountId(pub(crate) u64);

// [::STUB::] P0-9: N0012 — CallId newtype for call operations.
// Resolve by replacing with `use crate::model::CallId;` once P0-9 implements it.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CallId(pub(crate) u64);

// [::STUB::] P0-7: N0027 — OutgoingCallRequest for MakeCall variant.
// Resolve by replacing with `use crate::api::OutgoingCallRequest;` once P0-7 implements it.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub(crate) struct OutgoingCallRequest;

// [::STUB::] P0-7: N0028 — HangupReason for Hangup variant.
// Resolve by replacing with `use crate::api::HangupReason;` once P0-7 implements it.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HangupReason {
    Normal,
    Busy,
    Error,
}

// [::STUB::] P0-7: N0028 — DtmfMethod for SendDtmf variant.
// Resolve by replacing with `use crate::api::DtmfMethod;` once P0-7 implements it.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DtmfMethod {
    Rfc2833,
    Info,
    Inband,
}

// [::STUB::] P0-9: N0012 — MediaDirection for M20 ConfConnect variant.
// Defined here for reference but not used in base variants. Will be activated
// when M20 variants are added in P0-10.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MediaDirection {
    SendOnly,
    ReceiveOnly,
    Both,
}

// ============================================================================
// Type aliases
// ============================================================================

/// Reply channel type: a oneshot sender that delivers `Result<T, SipError>`.
///
/// Every RuntimeCommand variant carries one of these. The reactor sends the
/// operation result through this channel back to the caller.
pub(crate) type SipReply<T> = oneshot::Sender<Result<T, SipError>>;

// ============================================================================
// RuntimeCommand enum
// ============================================================================

/// All PJSUA-facing operations serialized through the unbounded MPSC channel.
///
/// Each variant carries a oneshot reply channel (`SipReply<T>`) that the
/// reactor uses to deliver the operation result. This design ensures PJSUA
/// thread-safety constraints are encapsulated — consumers never interact with
/// PJSUA types or threads directly.
///
/// Base variants cover 10 operations: Initialize through Shutdown.
/// M20 variants (ConfConnect, ConfDisconnect, GetAccountInfo, SubscribeAudio)
/// will be added in P0-10 behind `#[cfg(feature = "m20")]`.
///
/// # Send + Sync
///
/// RuntimeCommand is `Send` and `Sync` by construction — all field types
/// (oneshot::Sender, primitives, placeholder structs/enums) implement these
/// traits. Compile-time assertions below verify this invariant.
// [::STUB::] P0-7: The #[allow(dead_code)] on variants will be removed once the
// SipClient facade (P0-7) starts constructing and dispatching RuntimeCommand
// variants through the MPSC channel. All 10 variants are defined and tested;
// the dead_code warning is only because no consumer exists yet.
#[allow(dead_code)]
pub(crate) enum RuntimeCommand {
    /// Initialize the PJSUA library with the given `ClientConfig`.
    Initialize {
        config: ClientConfig,
        reply: SipReply<()>,
    },
    /// Register a new SIP account.
    AddAccount {
        config: AccountConfig,
        reply: SipReply<AccountId>,
    },
    /// Remove a previously registered account.
    RemoveAccount {
        account_id: AccountId,
        reply: SipReply<()>,
    },
    /// Enable or disable SIP registration for an account.
    SetRegistration {
        account_id: AccountId,
        enabled: bool,
        reply: SipReply<()>,
    },
    /// Place an outgoing SIP call.
    MakeCall {
        account_id: AccountId,
        request: OutgoingCallRequest,
        reply: SipReply<CallId>,
    },
    /// Hang up an active call.
    Hangup {
        call_id: CallId,
        reason: HangupReason,
        reply: SipReply<()>,
    },
    /// Place an active call on hold.
    Hold {
        call_id: CallId,
        reply: SipReply<()>,
    },
    /// Take a held call off hold.
    Unhold {
        call_id: CallId,
        reply: SipReply<()>,
    },
    /// Send DTMF digits on an active call.
    SendDtmf {
        call_id: CallId,
        digits: String,
        method: DtmfMethod,
        reply: SipReply<()>,
    },
    /// Gracefully shut down the PJSUA library and reactor thread.
    Shutdown {
        reply: SipReply<()>,
    },
}

// ============================================================================
// Compile-time Send + Sync assertions
// ============================================================================
// If a new variant field is added that is !Send or !Sync, these assertions
// will fail at compile time, preventing accidental thread-safety violations.

/// Compile-time assertion: `T` implements `Send`.
const fn assert_send<T: Send>() {}

/// Compile-time assertion: `T` implements `Sync`.
const fn assert_sync<T: Sync>() {}

/// Verify RuntimeCommand satisfies both Send and Sync.
const _: () = {
    assert_send::<RuntimeCommand>();
    assert_sync::<RuntimeCommand>();
};

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =======================================================================
    // C011 — N0010→N0009: Concurrency model → RuntimeCommand
    // =======================================================================

    #[test]
    // @verifies C011-precondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c011_precondition_module_declared_in_lib_rs() {
        let content =
            std::fs::read_to_string("src/lib.rs").expect("lib.rs must exist");
        assert!(
            content.contains("pub mod concurrency_contexts;"),
            "lib.rs must declare pub mod concurrency_contexts;"
        );
    }

    #[test]
    // @verifies C011-postcondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c011_postcondition_all_base_variants_constructable() {
        // Initialize
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::Initialize {
            config: ClientConfig,
            reply: tx,
        };

        // AddAccount
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::AddAccount {
            config: AccountConfig,
            reply: tx,
        };

        // RemoveAccount
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::RemoveAccount {
            account_id: AccountId(0),
            reply: tx,
        };

        // SetRegistration
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::SetRegistration {
            account_id: AccountId(0),
            enabled: true,
            reply: tx,
        };

        // MakeCall
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::MakeCall {
            account_id: AccountId(0),
            request: OutgoingCallRequest,
            reply: tx,
        };

        // Hangup
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::Hangup {
            call_id: CallId(0),
            reason: HangupReason::Normal,
            reply: tx,
        };

        // Hold
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::Hold {
            call_id: CallId(0),
            reply: tx,
        };

        // Unhold
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::Unhold {
            call_id: CallId(0),
            reply: tx,
        };

        // SendDtmf
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::SendDtmf {
            call_id: CallId(0),
            digits: "123#".to_string(),
            method: DtmfMethod::Rfc2833,
            reply: tx,
        };

        // Shutdown
        let (tx, _rx) = oneshot::channel();
        let _cmd = RuntimeCommand::Shutdown { reply: tx };
    }

    #[test]
    // @verifies C011-invariant
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c011_invariant_runtime_command_is_send_sync() {
        // These compile-time assertions verify Send+Sync at the type level.
        // If the enum gains a !Send or !Sync field, these will fail to compile.
        assert_send::<RuntimeCommand>();
        assert_sync::<RuntimeCommand>();
    }

    // =======================================================================
    // C068 — N0008→N0010: Module structure → RuntimeCommand
    // =======================================================================

    #[test]
    // @verifies C068-precondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c068_precondition_file_exists_with_n0010_header() {
        let content = std::fs::read_to_string(
            "src/concurrency_contexts/command_serialization.rs",
        )
        .expect("command_serialization.rs must exist");
        assert!(
            content.contains("N0010"),
            "header must reference N0010 node"
        );
        assert!(
            content.contains("RuntimeCommand"),
            "file must contain RuntimeCommand definition"
        );
    }

    #[test]
    // @verifies C068-postcondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c068_postcondition_pub_crate_visibility() {
        let content = std::fs::read_to_string(
            "src/concurrency_contexts/command_serialization.rs",
        )
        .expect("command_serialization.rs must exist");
        assert!(
            content.contains("pub(crate) enum RuntimeCommand"),
            "enum must be pub(crate)"
        );
    }

    #[test]
    // @verifies C068-postcondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c068_postcondition_mod_rs_declares_submodule() {
        let content =
            std::fs::read_to_string("src/concurrency_contexts/mod.rs")
                .expect("mod.rs must exist");
        assert!(
            content.contains("pub mod command_serialization"),
            "mod.rs must declare command_serialization submodule"
        );
        assert!(
            content.contains("RuntimeCommand"),
            "mod.rs must reference RuntimeCommand"
        );
    }

    #[test]
    // @verifies C068-invariant
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c068_invariant_not_re_exported_as_pub() {
        let content =
            std::fs::read_to_string("src/lib.rs").expect("lib.rs must exist");
        // lib.rs should only have `pub mod concurrency_contexts;` — no
        // `pub use` of RuntimeCommand which would expose it publicly.
        assert!(
            !content.contains("pub use")
                || !content.contains("RuntimeCommand"),
            "lib.rs must not pub re-export RuntimeCommand"
        );
    }

    // =======================================================================
    // C069 — N0010→N0011: RuntimeCommand → Public API
    // =======================================================================

    #[test]
    // @verifies C069-precondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c069_precondition_correct_reply_types() {
        // Initialize → SipReply<()>
        let (tx, _rx) = oneshot::channel::<Result<(), SipError>>();
        let _cmd = RuntimeCommand::Initialize {
            config: ClientConfig,
            reply: tx,
        };

        // AddAccount → SipReply<AccountId>
        let (tx, _rx) = oneshot::channel::<Result<AccountId, SipError>>();
        let _cmd = RuntimeCommand::AddAccount {
            config: AccountConfig,
            reply: tx,
        };

        // MakeCall → SipReply<CallId>
        let (tx, _rx) = oneshot::channel::<Result<CallId, SipError>>();
        let _cmd = RuntimeCommand::MakeCall {
            account_id: AccountId(0),
            request: OutgoingCallRequest,
            reply: tx,
        };

        // All others → SipReply<()>
        let (tx, _rx) = oneshot::channel::<Result<(), SipError>>();
        let _cmd = RuntimeCommand::Shutdown { reply: tx };
    }

    /// Map a RuntimeCommand variant to its canonical name string.
    /// This demonstrates exhaustive dispatch coverage — every variant is
    /// handled explicitly, with no catch-all `_` arm.
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn variant_name(cmd: &RuntimeCommand) -> &'static str {
        match cmd {
            RuntimeCommand::Initialize { .. } => "Initialize",
            RuntimeCommand::AddAccount { .. } => "AddAccount",
            RuntimeCommand::RemoveAccount { .. } => "RemoveAccount",
            RuntimeCommand::SetRegistration { .. } => "SetRegistration",
            RuntimeCommand::MakeCall { .. } => "MakeCall",
            RuntimeCommand::Hangup { .. } => "Hangup",
            RuntimeCommand::Hold { .. } => "Hold",
            RuntimeCommand::Unhold { .. } => "Unhold",
            RuntimeCommand::SendDtmf { .. } => "SendDtmf",
            RuntimeCommand::Shutdown { .. } => "Shutdown",
        }
    }

    #[test]
    // @verifies C069-postcondition
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c069_postcondition_exhaustive_variant_dispatch() {
        let (tx, _rx) = oneshot::channel::<Result<(), SipError>>();
        let cmd = RuntimeCommand::Initialize {
            config: ClientConfig,
            reply: tx,
        };
        assert_eq!(variant_name(&cmd), "Initialize");

        let (tx, _rx) = oneshot::channel::<Result<(), SipError>>();
        let cmd = RuntimeCommand::Shutdown { reply: tx };
        assert_eq!(variant_name(&cmd), "Shutdown");
    }

    #[test]
    // @verifies C069-invariant
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn c069_invariant_closed_channel_send_returns_err() {
        let (tx, rx) = oneshot::channel::<Result<(), SipError>>();
        drop(rx); // Close the receiver before sending.
        let result = tx.send(Ok(()));
        assert!(
            result.is_err(),
            "sending on closed oneshot channel must return Err"
        );
    }

    // =======================================================================
    // Normal-case tests — variant field correctness
    // =======================================================================

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn send_dtmf_carries_digits_and_method() {
        let (tx, _rx) = oneshot::channel();
        let cmd = RuntimeCommand::SendDtmf {
            call_id: CallId(1),
            digits: "456*".to_string(),
            method: DtmfMethod::Info,
            reply: tx,
        };
        match cmd {
            RuntimeCommand::SendDtmf {
                digits, method, ..
            } => {
                assert_eq!(digits, "456*");
                assert_eq!(method, DtmfMethod::Info);
            }
            _ => panic!("expected SendDtmf variant"),
        }
    }

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn hangup_carries_reason() {
        let (tx, _rx) = oneshot::channel();
        let cmd = RuntimeCommand::Hangup {
            call_id: CallId(1),
            reason: HangupReason::Busy,
            reply: tx,
        };
        match cmd {
            RuntimeCommand::Hangup { reason, .. } => {
                assert_eq!(reason, HangupReason::Busy);
            }
            _ => panic!("expected Hangup variant"),
        }
    }

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn hangup_reason_normal_variant() {
        let (tx, _rx) = oneshot::channel();
        let cmd = RuntimeCommand::Hangup {
            call_id: CallId(1),
            reason: HangupReason::Normal,
            reply: tx,
        };
        match cmd {
            RuntimeCommand::Hangup { reason, .. } => {
                assert_eq!(reason, HangupReason::Normal);
            }
            _ => panic!("expected Hangup variant"),
        }
    }

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn set_registration_carries_enabled_flag() {
        let (tx, _rx) = oneshot::channel();
        let cmd = RuntimeCommand::SetRegistration {
            account_id: AccountId(5),
            enabled: false,
            reply: tx,
        };
        match cmd {
            RuntimeCommand::SetRegistration { enabled, .. } => {
                assert!(!enabled);
            }
            _ => panic!("expected SetRegistration variant"),
        }
    }

    // =======================================================================
    // Boundary-case tests
    // =======================================================================

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn shutdown_has_only_reply_field() {
        // Shutdown carries exactly one field (reply). This test verifies
        // construction succeeds with only the reply channel.
        let (tx, _rx) = oneshot::channel::<Result<(), SipError>>();
        let cmd = RuntimeCommand::Shutdown { reply: tx };
        assert_send::<RuntimeCommand>();
        assert_sync::<RuntimeCommand>();
        // Variant name check proves the expected discriminant.
        assert_eq!(variant_name(&cmd), "Shutdown");
    }

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn account_id_zero_and_non_zero() {
        let (tx, _rx) = oneshot::channel();
        let _cmd_zero = RuntimeCommand::RemoveAccount {
            account_id: AccountId(0),
            reply: tx,
        };
        let (tx, _rx) = oneshot::channel();
        let _cmd_nonzero = RuntimeCommand::RemoveAccount {
            account_id: AccountId(42),
            reply: tx,
        };
    }

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn call_id_zero_and_non_zero() {
        let (tx, _rx) = oneshot::channel();
        let _cmd_zero = RuntimeCommand::Hold {
            call_id: CallId(0),
            reply: tx,
        };
        let (tx, _rx) = oneshot::channel();
        let _cmd_nonzero = RuntimeCommand::Hold {
            call_id: CallId(999),
            reply: tx,
        };
    }

    // =======================================================================
    // SipReply type alias tests
    // =======================================================================

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn sip_reply_type_alias_accepts_correct_types() {
        // Verify SipReply<()> accepts Result<(), SipError>
        let (tx, _rx) = oneshot::channel();
        let _reply: SipReply<()> = tx;

        // Verify SipReply<AccountId> accepts Result<AccountId, SipError>
        let (tx, _rx) = oneshot::channel();
        let _reply: SipReply<AccountId> = tx;

        // Verify SipReply<CallId> accepts Result<CallId, SipError>
        let (tx, _rx) = oneshot::channel();
        let _reply: SipReply<CallId> = tx;
    }

    // =======================================================================
    // Integration-level — value access via pattern matching
    // =======================================================================

    #[test]
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn remove_account_retains_account_id() {
        let (tx, _rx) = oneshot::channel();
        let cmd = RuntimeCommand::RemoveAccount {
            account_id: AccountId(7),
            reply: tx,
        };
        match cmd {
            RuntimeCommand::RemoveAccount { account_id, .. } => {
                assert_eq!(account_id, AccountId(7));
            }
            _ => panic!("expected RemoveAccount variant"),
        }
    }
}

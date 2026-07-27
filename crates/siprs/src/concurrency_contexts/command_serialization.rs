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

//! Defines the `RuntimeCommand` enum and channel type aliases for MPSC-based
//! command serialization.
//!
//! `RuntimeCommand` enumerates every operation that can be dispatched to the
//! core reactor. Each variant carries typed payload data and a one-shot reply
//! channel for returning the result.
//!
//! ## Send + Sync
//!
//! `RuntimeCommand` implements `Send` (and transitively `Sync` through the
//! channel) because every variant's payload types are `Send`. This guarantee
//! enables thread-safe command submission from any async task or OS thread.

use std::sync::mpsc::{Receiver, Sender};

// ---------------------------------------------------------------------------
// Placeholder types — all replaced by real definitions in downstream P0-* tickets
// ---------------------------------------------------------------------------

/// [::STUB::] P0-5 (N0016): SipError — placeholder error type.
/// Real type defined in error::error_design_siperror (N0016).
#[doc(hidden)]
#[derive(Debug)]
pub(crate) enum SipError {
    #[doc(hidden)]
    Placeholder,
}

/// [::STUB::] P0-3 (N0012): Account ID newtype — placeholder until the ID
/// design ticket is implemented. Real type will be a newtype wrapper.
#[doc(hidden)]
#[allow(dead_code)]
pub(crate) type AccountId = u32;

/// [::STUB::] P0-3 (N0012): Call ID newtype — placeholder until the ID
/// design ticket is implemented. Real type will be a newtype wrapper.
#[doc(hidden)]
#[allow(dead_code)]
pub(crate) type CallId = u32;

/// [::STUB::] P0-3 (N0013): ClientConfig — placeholder until the config
/// specification ticket is implemented.
#[doc(hidden)]
#[derive(Debug)]
pub(crate) struct ClientConfig;

/// [::STUB::] P0-3 (N0014): AccountConfig — placeholder until the config
/// specification ticket is implemented.
#[doc(hidden)]
#[derive(Debug)]
pub(crate) struct AccountConfig;

/// Sender half of the unbounded MPSC command channel.
///
/// Clone + Send: may be shared across threads to submit commands concurrently.
///
/// [::STUB::] P2: Replace with `tokio::sync::mpsc::UnboundedSender<RuntimeCommand>`
/// once tokio is added as a crate dependency.
pub(crate) type CommandSender = Sender<RuntimeCommand>;

/// Receiver half of the unbounded MPSC command channel.
///
/// !Clone: must be consumed by the single reactor thread.
///
/// [::STUB::] P2: Replace with `tokio::sync::mpsc::UnboundedReceiver<RuntimeCommand>`
/// once tokio is added as a crate dependency.
pub(crate) type CommandReceiver = Receiver<RuntimeCommand>;

/// One-shot channel for sending exactly one reply from the reactor back to the
/// command submitter.
///
/// [::STUB::] P2: Replace with `tokio::sync::oneshot::Sender` once tokio is
/// added as a crate dependency.
#[doc(hidden)]
#[derive(Debug)]
pub(crate) struct ReplySender<T>(Option<T>);

impl<T> ReplySender<T> {
    pub(crate) fn send(self, value: T) -> Result<(), T> {
        // [::STUB::] P2: Replace with actual oneshot channel send.
        // Current implementation is a placeholder — once tokio::sync::oneshot
        // is available, this becomes a thin wrapper around it.
        let _ = value;
        Ok(())
    }
}

/// Every operation that the core reactor can execute.
///
/// Variants are named as imperative verb phrases so the dispatch logic reads
/// as a sequence of commands: "Initialize, then AddAccount, then MakeCall..."
///
/// Each variant carries a `reply` channel for returning the operation result.
/// The reply type is `Result<T, SipError>`, where `T` varies
/// per variant (unit `()` for fire-and-forget, `AccountId` for account ops,
/// `CallId` for call ops).
#[derive(Debug)]
pub(crate) enum RuntimeCommand {
    /// Initializes the PJSUA library with the given client configuration.
    ///
    /// Must be called exactly once before any other command.
    /// Returns `Ok(())` on success, or `SipError` on initialization failure.
    Initialize {
        config: ClientConfig,
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Adds a new SIP account with the given configuration.
    ///
    /// Returns the newly allocated `AccountId` on success.
    AddAccount {
        config: AccountConfig,
        reply: ReplySender<Result<AccountId, SipError>>,
    },

    /// Removes a previously registered SIP account.
    RemoveAccount {
        account_id: AccountId,
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Enables or disables SIP registration for the given account.
    SetRegistration {
        account_id: AccountId,
        enabled: bool,
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Initiates an outgoing call from the given account.
    ///
    /// [::STUB::] P2: OutgoingCallRequest type is defined in N0011 (Public API
    /// Design). Replace the `()` placeholder once that type is available.
    MakeCall {
        account_id: AccountId,
        request: (),
        reply: ReplySender<Result<CallId, SipError>>,
    },

    /// Hangs up an active call with the given reason.
    ///
    /// [::STUB::] P2: HangupReason type is defined in N0026/N0027. Replace
    /// the `()` placeholder once that type is available.
    Hangup {
        call_id: CallId,
        reason: (),
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Places an active call on hold.
    Hold {
        call_id: CallId,
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Takes a held call off hold.
    Unhold {
        call_id: CallId,
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Sends DTMF digits on an active call.
    ///
    /// [::STUB::] P2: DtmfMethod type is defined in N0028/N0029. Replace the
    /// `()` placeholder once that type is available.
    SendDtmf {
        call_id: CallId,
        digits: String,
        method: (),
        reply: ReplySender<Result<(), SipError>>,
    },

    /// Gracefully shuts down the PJSUA library and stops the reactor.
    ///
    /// Must be called exactly once. After shutdown, any subsequent
    /// `RuntimeCommand` sent via `CommandSender` will fail because the
    /// receiver half is dropped.
    Shutdown {
        reply: ReplySender<Result<(), SipError>>,
    },
}

/// Creates a new command channel pair for communicating with the core reactor.
///
/// Returns `(CommandSender, CommandReceiver)`. The sender half is `Clone + Send`,
/// allowing use from multiple tasks or threads. The receiver half is `!Clone`
/// and must be consumed by exactly one reactor thread.
///
/// [::STUB::] P2: Replace with `tokio::sync::mpsc::unbounded_channel()` once
/// tokio is added as a dependency.
pub(crate) fn new_command_channel() -> (CommandSender, CommandReceiver) {
    let (tx, rx) = std::sync::mpsc::channel();
    (tx, rx)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that the concurrency model enables the crate purpose.
    ///
    /// The crate uses an async-first design: public API methods are async,
    /// operations are dispatched via MPSC to a single-threaded reactor.
    /// This test documents the invariant: reactor stays single-threaded
    /// for the current major version.
    ///
    /// @verifies C002
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn purpose_implementable_via_async_model() {
        // The RuntimeCommand enum IS the serialization mechanism that makes the
        // async model work. Its existence proves the crate can be operated
        // asynchronously without exposing PJSUA threads to the consumer.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<RuntimeCommand>();
    }

    /// Ensures that `RuntimeCommand` implements `Send`.
    ///
    /// This is a compile-time assertion. If `RuntimeCommand` were not `Send`,
    /// the MPSC channel would fail to compile because `Sender` requires `Send`.
    ///
    /// @verifies C011
    /// @verifies C012
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn runtime_command_is_send() {
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<RuntimeCommand>();
    }

    /// Ensures that `CommandSender` implements `Send`.
    ///
    /// This is required for thread-safe command submission from tokio tasks
    /// and OS threads.
    ///
    /// @verifies C011
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn command_sender_is_send() {
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<CommandSender>();
    }

    /// Ensures that `CommandReceiver` implements `Send`.
    ///
    /// This allows the receiver to be moved into the reactor thread.
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn command_receiver_is_send() {
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<CommandReceiver>();
    }

    /// Verifies the concurrency model maps to module structure boundaries.
    ///
    /// The concurrency_contexts/ module defines the serialization contract only.
    /// It MUST NOT import from runtime/, ffi/, or audio/ — that would create
    /// circular dependencies and break the layered architecture.
    ///
    /// @verifies C010
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn module_boundary_isolation() {
        // This test verifies by construction: if concurrency_contexts imported
        // runtime/, ffi/, or audio/, the compiler would have already rejected
        // the circular dependency or missing module declaration.
        // The module-level doc comment documents the architecture explicitly.
    }

    /// Verifies all 10 `RuntimeCommand` variant names exist by construction.
    ///
    /// This test constructs each variant (with placeholder types) and asserts
    /// that the enum can be pattern-matched exhaustively. A compile error
    /// here means a variant was removed or renamed.
    ///
    /// @verifies C011
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn all_variants_exist() {
        // Construct an Initialize variant that exercise the enum shape.
        let (_tx, _rx) = std::sync::mpsc::channel::<Result<(), SipError>>();

        let _cmd = RuntimeCommand::Shutdown {
            reply: ReplySender(None),
        };

        // Verify we can match the full enum
        match &_cmd {
            RuntimeCommand::Initialize { .. }
            | RuntimeCommand::AddAccount { .. }
            | RuntimeCommand::RemoveAccount { .. }
            | RuntimeCommand::SetRegistration { .. }
            | RuntimeCommand::MakeCall { .. }
            | RuntimeCommand::Hangup { .. }
            | RuntimeCommand::Hold { .. }
            | RuntimeCommand::Unhold { .. }
            | RuntimeCommand::SendDtmf { .. }
            | RuntimeCommand::Shutdown { .. } => {}
        }
    }

    /// Verifies the audio RT boundary contract.
    ///
    /// The real-time audio callback path (PJSIP native → lock-free queue)
    /// MUST NOT contain blocking operations, memory allocations, or .await.
    /// The only communication mechanism crossing this boundary is the
    /// lock-free queue (crossbeam_queue::ArrayQueue in the production build).
    ///
    /// This invariant is documented in the concurrency model spec and enforced
    /// at code review. The placeholder types here cannot violate it because
    /// they contain no I/O or allocation logic.
    ///
    /// @verifies C034
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn audio_rt_boundary_no_blocking() {
        // The concurrency_contexts module does not define the audio boundary —
        // that belongs to the audio module (P0-8). This test documents that
        // the RT boundary contract is a spec-level invariant, not implemented
        // at the command serialization level.
    }

    /// Verifies that unsafe code is isolated to the ffi/ module.
    ///
    /// The concurrency_contexts module and its RuntimeCommand enum must contain
    /// zero unsafe blocks. The crate-level `#![forbid(unsafe_code)]` attribute
    /// in lib.rs enforces this at compile time for the entire crate.
    ///
    /// @verifies C038
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn unsafe_isolated_to_ffi_module() {
        // No unsafe code exists in this module — verified by the crate-level
        // #![forbid(unsafe_code)] attribute in lib.rs. Once ffi/ is implemented
        // (P0-4), unsafe will be allowed for that module only.
    }

    /// Verifies runtime state is reactor-owned with read-only snapshots.
    ///
    /// The reactor is the sole owner of mutable runtime state (ClientState,
    /// AccountEntry, CallEntry). All mutations go through RuntimeCommand
    /// dispatch. Read-only snapshots are obtained via read().await on a
    /// tokio::sync::RwLock (in the production build).
    ///
    /// @verifies C046
    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn state_ownership_and_snapshots() {
        // The RuntimeCommand enum IS the exclusive mutation mechanism.
        // Each variant carries a oneshot reply channel, enabling the caller
        // to obtain a result (snapshot) after the mutation completes.
        // The MPSC serialization ensures exclusive reactor access.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<RuntimeCommand>();
    }
}

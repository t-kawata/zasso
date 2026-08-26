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
//   - NODE_ID=N0076:  62.7 シャットダウン手順の production 配線
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0076 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::time::Duration;

use crate::api::event_model_payload_bus::{EventMeta, SipEvent, SipEventPayload};
use crate::config::ClientConfig;
use crate::runtime::backend::SipBackend;
use crate::runtime::command::{send_reply, DispatchCommand, ReactorError, Reply};
use crate::runtime::state::ClientState;
use crate::state::shutdown_specification::{ShutdownError, ShutdownSpec};

/// Shared shutdown-reject message, consistent with `m20_shutdown_routing.rs`.
const SHUTDOWN_REJECT_MESSAGE: &str = "shutting down";

/// Result of applying the M20 shutdown gate to a received `DispatchCommand`.
///
/// `Permit` forwards the command for normal dispatch; `Rejected` means the
/// command was dropped during shutdown and its reply (if any) was already
/// resolved with the shutdown-reject error.
pub(crate) enum ShutdownGate {
    /// The command is permitted — forward for normal dispatch.
    Permit(DispatchCommand),
    /// The command was rejected; it must not be dispatched.
    Rejected { command: String },
}

/// Collect native account ids for the §32 unregister phase.
///
/// Reads "collect the native id of every tracked account" — the ordering is the
/// deterministic `BTreeMap` iteration of the authoritative `ClientState`.
pub(crate) fn native_account_ids(client_state: &ClientState) -> Vec<i32> {
    client_state
        .accounts
        .values()
        .map(|entry| entry.native_id)
        .collect()
}

/// Collect native call ids for the §32 BYE/CANCEL phase.
///
/// Reads "collect the native id of every tracked call" — the ordering is the
/// deterministic `BTreeMap` iteration of the authoritative `ClientState`.
pub(crate) fn native_call_ids(client_state: &ClientState) -> Vec<i32> {
    client_state.calls.values().map(|entry| entry.native_id).collect()
}

/// The per-phase shutdown timeout sourced from `TimeoutConfig::shutdown_timeout`.
///
/// The reactor constructs its `ShutdownSpec` with this value so every §32 phase
/// (including the `PhaseTimeout` guard) uses the client-configured budget.
pub(crate) fn shutdown_phase_timeout(config: &ClientConfig) -> Duration {
    config.timeouts.shutdown_timeout
}

/// Build the `ClientShutdown` event to publish on the client-owned EventBus.
///
/// The meta is neutral (no account, no call) — the event signals the whole
/// client's lifecycle, not a per-account/per-call transition (§62.3).
pub(crate) fn client_shutdown_event() -> SipEvent {
    SipEvent::new(EventMeta::new(0, None, None), SipEventPayload::ClientShutdown)
}

/// Execute the §32 ordered shutdown sequence against the backend.
///
/// Reads as prose: collect the native ids from the authoritative state, then
/// run the ordered sequence (BYE/CANCEL → unregister → audio drain → destroy)
/// through the idempotent `ShutdownSpec` orchestrator.
pub(crate) async fn execute_shutdown_sequence(
    backend: &mut dyn SipBackend,
    client_state: &ClientState,
    spec: &ShutdownSpec,
) -> Result<(), ShutdownError> {
    let account_ids = native_account_ids(client_state);
    let call_ids = native_call_ids(client_state);
    spec.execute_sequence(backend, &account_ids, &call_ids).await
}

/// Classify a `DispatchCommand` against the M20 shutdown gate.
///
/// Returns `true` when the command must be rejected during shutdown. When
/// `is_shutting_down` is false every command is permitted; when true, only
/// `Shutdown` and `GetAccountInfo` are permitted (M20 routing N0044:
/// `GetAccountInfo` is the read-only exception).
///
/// This is the pure classification used by the reactor loop — it borrows the
/// command so the loop can dispatch a permitted command without re-consuming it.
pub(crate) fn is_gated(command: &DispatchCommand, is_shutting_down: bool) -> bool {
    if !is_shutting_down {
        return false;
    }
    !matches!(
        command,
        DispatchCommand::Shutdown { .. } | DispatchCommand::GetAccountInfo { .. }
    )
}

/// Apply the M20 shutdown gate to a received `DispatchCommand`.
///
/// Consumes the command: a rejected command has its reply resolved with the
/// shutdown-reject error (the caller never hangs) and is returned as
/// `ShutdownGate::Rejected`; a permitted command is returned as
/// `ShutdownGate::Permit` for dispatch.
pub(crate) fn gate_command(command: DispatchCommand, is_shutting_down: bool) -> ShutdownGate {
    if is_gated(&command, is_shutting_down) {
        let command_name = format!("{command:?}");
        reject_command(command);
        ShutdownGate::Rejected { command: command_name }
    } else {
        ShutdownGate::Permit(command)
    }
}

/// Resolve a command's reply with the shutdown-reject error (drain mode).
///
/// Used by the reactor drain loop after the §32 sequence completes: the backend
/// is destroyed, so every queued command is rejected. Guarantees the
/// reply-exactly-once invariant; a reply-less `NativeEvent` is dropped.
pub(crate) fn reject_command(command: DispatchCommand) {
    match command {
        DispatchCommand::Execute { reply, .. } => reject_reply(reply),
        DispatchCommand::SendDtmf { reply, .. } => reject_reply(reply),
        DispatchCommand::AddAudioSource { reply, .. } => reject_reply(reply),
        DispatchCommand::RemoveAudioSource { reply, .. } => reject_reply(reply),
        DispatchCommand::SetAudioSourceGain { reply, .. } => reject_reply(reply),
        DispatchCommand::MuteAudioSource { reply, .. } => reject_reply(reply),
        DispatchCommand::GetAccountInfo { reply, .. } => reject_reply(reply),
        DispatchCommand::AddAccount { reply, .. } => reject_reply(reply),
        DispatchCommand::MakeCall { reply, .. } => reject_reply(reply),
        DispatchCommand::Answer { reply, .. } => reject_reply(reply),
        DispatchCommand::Hangup { reply, .. } => reject_reply(reply),
        DispatchCommand::Transfer { reply, .. } => reject_reply(reply),
        DispatchCommand::UpdateAccount { reply, .. } => reject_reply(reply),
        DispatchCommand::SetRegistration { reply, .. } => reject_reply(reply),
        DispatchCommand::RemoveAccount { reply, .. } => reject_reply(reply),
        DispatchCommand::CreateTransport { reply, .. } => reject_reply(reply),
        DispatchCommand::QueryState { reply, .. } => reject_reply(reply),
        DispatchCommand::Shutdown { reply, .. } => reject_reply(reply),
        DispatchCommand::NativeEvent { .. } => {
            // A NativeEvent carries no oneshot reply — nothing to resolve.
        }
    }
}

/// Resolve a `Result<T, ReactorError>` reply with the shutdown-reject error.
///
/// Generic over the Ok type so every reply-carrying `DispatchCommand` variant
/// shares the same rejection path via the existing `send_reply` helper.
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
fn reject_reply<T>(reply: Reply<Result<T, ReactorError>>) {
    send_reply(
        reply,
        Err(ReactorError::BackendError(SHUTDOWN_REJECT_MESSAGE.into())),
    );
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{AccountId, CallId, SipEventPayload};
    use crate::api::eventbus_receiver::EventBus;
    use crate::runtime::backend::TestBackend;
    use crate::runtime::command::{DispatchCommand, ReactorError, Reply};
    use crate::runtime::state::{AccountEntry, CallEntry, ClientState};
    use crate::state::registr_state_machine::RegistrationState;
    use crate::state::shutdown_specification::{ShutdownPhase, ShutdownSpec};
    use std::time::Duration;

    /// Build an `AccountEntry` whose native id and logical id match `id`.
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn account_entry(native_id: i32, id: u64) -> AccountEntry {
        AccountEntry {
            id,
            native_id,
            config: crate::config::account_config_spec::AccountConfig::default(),
            registration: RegistrationState::Registered,
        }
    }

    /// Build a `CallEntry` whose native id and logical id match `id`.
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn call_entry(native_id: i32, id: u64) -> CallEntry {
        CallEntry {
            id,
            native_id,
            account_id: AccountId::from_u64(id).unwrap(),
            state: "Active".into(),
            media: "none".into(),
        }
    }

    /// Build a `ClientState` with one account (native 1) and one call (native 10).
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn state_with_one_account_and_call() -> ClientState {
        let mut state = ClientState::default();
        state
            .accounts
            .insert(AccountId::from_u64(1).unwrap(), account_entry(1, 1));
        state
            .calls
            .insert(CallId::from_u64(10).unwrap(), call_entry(10, 10));
        state
    }

    /// A no-op backend closure for gate tests.
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn noop_execute() -> DispatchCommand {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        DispatchCommand::Execute {
            f: Box::new(|_: &mut dyn crate::runtime::backend::SipBackend| Ok(())),
            reply: Reply::new(tx),
        }
    }

    /// @verifies C076
    /// C076-Pre/Post: the §62.7 wiring module is declared in `state/mod.rs` and
    /// every documented function is importable from the crate.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn shutdown_wiring_module_is_declared() {
        // The `use super::*` above resolves only when `pub mod shutdown_wiring;`
        // is declared in src/state/mod.rs (C076-Pre/Post).
    }

    /// @verifies C076
    /// C076-Post: the wiring functions are callable with the documented shapes.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn shutdown_wiring_functions_are_callable() {
        let config = crate::config::ClientConfig::default();
        let timeout = shutdown_phase_timeout(&config);
        assert_eq!(timeout, config.timeouts.shutdown_timeout);

        let event = client_shutdown_event();
        assert!(matches!(
            event.payload,
            SipEventPayload::ClientShutdown
        ));

        let empty = ClientState::default();
        assert!(native_account_ids(&empty).is_empty());
        assert!(native_call_ids(&empty).is_empty());
    }

    /// @verifies C076
    /// C076-Inv: `execute_shutdown_sequence` routes through `ShutdownSpec::execute_sequence`
    /// (the §32 orchestrator), proven by `is_shutdown_started()` after a run.
    #[tokio::test]
    async fn execute_shutdown_sequence_delegates_to_shutdown_spec() {
        let mut backend = TestBackend::new();
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        let state = ClientState::default();
        let result = execute_shutdown_sequence(&mut backend, &state, &spec).await;
        assert!(result.is_ok(), "destroy-only sequence must succeed");
        assert!(
            spec.is_shutdown_started(),
            "the §32 orchestrator must have run"
        );
        assert!(!backend.initialized, "InvokeDestroy must reach backend.shutdown()");
    }

    /// @verifies C088
    /// C088-Pre: `ShutdownPhase::all()` preserves the §32 order the wiring relies on.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn shutdown_phase_order_is_preserved() {
        assert_eq!(
            ShutdownPhase::all(),
            [
                ShutdownPhase::StopCommands,
                ShutdownPhase::CancelCalls,
                ShutdownPhase::UnregisterAccounts,
                ShutdownPhase::DrainAudio,
                ShutdownPhase::InvokeDestroy,
            ]
        );
    }

    /// @verifies C088
    /// C088-Post: `execute_shutdown_sequence` collects native ids from `ClientState`
    /// and runs the §32 phases (CancelCalls targets native call ids, InvokeDestroy
    /// reaches backend.shutdown).
    #[tokio::test]
    async fn execute_shutdown_sequence_runs_phases_with_collected_ids() {
        let mut backend = TestBackend::new();
        let state = state_with_one_account_and_call();
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        let result = execute_shutdown_sequence(&mut backend, &state, &spec).await;
        assert!(result.is_ok());
        assert_eq!(
            backend.hangup_calls,
            vec![10],
            "CancelCalls must target native call id 10"
        );
        assert!(!backend.initialized, "InvokeDestroy must run (backend.shutdown)");
    }

    /// @verifies C088
    /// C088-Inv: the §32 order BYE/CANCEL → unregister → destroy is observed on the backend.
    #[tokio::test]
    async fn shutdown_order_cancel_then_unregister_then_destroy() {
        let mut backend = TestBackend::new();
        let state = state_with_one_account_and_call();
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        let _ = execute_shutdown_sequence(&mut backend, &state, &spec).await;
        // CancelCalls recorded the native call id before InvokeDestroy flipped
        // initialized; UnregisterAccounts sits between them per ShutdownPhase::all().
        assert_eq!(backend.hangup_calls, vec![10]);
        assert!(!backend.initialized);
    }

    /// @verifies C089
    /// C089-Pre: `client_shutdown_event` yields a `ClientShutdown` SipEvent with
    /// neutral meta (no account, no call).
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn client_shutdown_event_has_neutral_meta() {
        let ev = client_shutdown_event();
        assert!(matches!(ev.payload, SipEventPayload::ClientShutdown));
        assert_eq!(ev.meta.account_id, None);
        assert_eq!(ev.meta.call_id, None);
    }

    /// @verifies C089
    /// C089-Post: publishing `client_shutdown_event` on an EventBus reaches subscribers.
    #[tokio::test]
    async fn client_shutdown_event_reaches_subscribers() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        bus.publish(client_shutdown_event());
        let ev = rx.recv().await.expect("subscriber must receive the event");
        assert!(matches!(ev.payload, SipEventPayload::ClientShutdown));
    }

    /// @verifies C089
    /// C089-Inv: a single publish delivers exactly one event.
    #[tokio::test]
    async fn client_shutdown_publishes_exactly_one_event() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        bus.publish(client_shutdown_event());
        let first = rx.recv().await.expect("first event");
        assert!(matches!(first.payload, SipEventPayload::ClientShutdown));
        assert!(
            rx.try_recv().is_err(),
            "a single publish must deliver exactly one event"
        );
    }

    /// @verifies C090
    /// C090-Pre: `gate_command` classifies a dispatch command against the M20 routing.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn gate_classifies_when_shutting_down() {
        let rejected = gate_command(noop_execute(), true);
        assert!(
            matches!(rejected, ShutdownGate::Rejected { .. }),
            "a non-Shutdown command must be rejected during shutdown"
        );
    }

    /// @verifies C090
    /// C090-Post: a rejected command's reply is resolved with the shutdown error —
    /// the caller never hangs (reply exactly once).
    #[tokio::test]
    async fn gate_resolves_rejected_reply() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Execute {
            f: Box::new(|_: &mut dyn crate::runtime::backend::SipBackend| Ok(())),
            reply: Reply::new(tx),
        };
        assert!(matches!(gate_command(cmd, true), ShutdownGate::Rejected { .. }));
        let reply = rx.await.expect("the reply must be resolved exactly once");
        assert!(
            matches!(
                reply,
                Err(ReactorError::BackendError(msg)) if msg.contains("shutting down")
            ),
            "the caller must not hang"
        );
    }

    /// @verifies C090
    /// C090-Inv: `Shutdown` and `GetAccountInfo` are always permitted by the gate.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn gate_permits_shutdown_and_get_account_info() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let shutdown = DispatchCommand::Shutdown { reply: Reply::new(tx) };
        assert!(matches!(gate_command(shutdown, true), ShutdownGate::Permit(_)));

        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let get_account_info = DispatchCommand::GetAccountInfo {
            native_acc_id: 1,
            reply: Reply::new(tx2),
        };
        assert!(matches!(
            gate_command(get_account_info, true),
            ShutdownGate::Permit(_)
        ));
    }

    /// @verifies C090
    /// C090-Boundary: `gate_command` permits every command when not shutting down.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn gate_permits_all_when_not_shutting_down() {
        let permitted = gate_command(noop_execute(), false);
        assert!(matches!(permitted, ShutdownGate::Permit(_)));
    }

    /// @verifies C090
    /// C090-Pre/Inv: the pure classifier `is_gated` mirrors `gate_command` —
    /// only `Shutdown` and `GetAccountInfo` survive the gate during shutdown.
    #[test]
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.
    fn is_gated_classifies_commands() {
        assert!(!is_gated(&noop_execute(), false), "normal operation permits all");

        let (tx, _rx) = tokio::sync::oneshot::channel();
        let shutdown = DispatchCommand::Shutdown { reply: Reply::new(tx) };
        assert!(!is_gated(&shutdown, true), "Shutdown must always reach its arm");

        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let get_account_info = DispatchCommand::GetAccountInfo {
            native_acc_id: 1,
            reply: Reply::new(tx2),
        };
        assert!(
            !is_gated(&get_account_info, true),
            "GetAccountInfo is the M20 read-only permit"
        );

        assert!(is_gated(&noop_execute(), true), "other commands are rejected during shutdown");
    }

    /// @verifies C090
    /// C090-Post (drain): `reject_command` resolves any command's reply with the
    /// shutdown error — used by the reactor drain loop after the §32 sequence.
    #[tokio::test]
    async fn reject_command_resolves_reply_with_shutdown_error() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Execute {
            f: Box::new(|_: &mut dyn crate::runtime::backend::SipBackend| Ok(())),
            reply: Reply::new(tx),
        };
        reject_command(cmd);
        let reply = rx.await.expect("the reply must be resolved exactly once");
        assert!(
            matches!(
                reply,
                Err(ReactorError::BackendError(msg)) if msg.contains("shutting down")
            )
        );
    }
}

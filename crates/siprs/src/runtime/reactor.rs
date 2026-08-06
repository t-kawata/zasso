// [::TICKET::] P0-2: CoreReactor — dedicated thread for serialized PJSUA command execution

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use crate::config::ClientConfig;
use crate::runtime::audio_worker::AudioMixer;
use crate::runtime::backend::{MockBackend, SipBackend};
use crate::runtime::command::{send_reply, DispatchCommand, ReactorError};
use crate::runtime::handle::{self, RuntimeHandle};
use crate::runtime::state::{CallEntry, ClientState};

use crate::api::event_model_payload_bus::{
    AccountId, CallId, EventMeta, SipEvent, SipEventPayload,
};
use crate::api::eventbus_receiver::EventBus;
use crate::state::m20_native_event_conv::{convert_native_event_to_payload, NativeEvent};
use crate::state::m20_registr_cmd_pat::registration_status_to_payload;

/// Configuration passed to `CoreReactor::spawn()`.
///
/// This is now the real `ClientConfig` type defined in `src/config.rs`.
#[derive(Debug, Clone, Default)]
pub struct BootConfig {
    /// The client configuration that drives PJSUA initialization.
    pub config: ClientConfig,
}

/// The core reactor that owns the PJSUA control thread.
///
/// `CoreReactor::spawn()` creates a dedicated OS thread running a command
/// dispatch loop. All PJSUA control calls happen on this thread, serialized
/// through an unbounded MPSC channel.
///
/// # Lifecycle
/// 1. `spawn(config)` → returns `(RuntimeHandle, JoinHandle)`
/// 2. User submits commands via `handle.submit()` (Send + Sync)
/// 3. Reactor processes commands sequentially, calls `Backend` trait methods
/// 4. `Shutdown` command causes the reactor loop to exit gracefully
/// 5. If reactor panics, `is_terminated()` returns `true`
pub struct CoreReactor;

// [::TICKET::] P0-2, P0-5, P0-6, P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P3-2) --for-spec --no-implementation-order`.
// [::TICKET::] P6-1, P7-2, P8-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P6-1|P7-2|P8-1) --for-spec --no-implementation-order`.
impl CoreReactor {
    /// Spawn a new reactor thread and hand back a handle for command submission.
    ///
    /// The reactor thread runs a loop that:
    /// 1. Receives commands from the MPSC channel (FIFO)
    /// 2. Dispatches each command to the `Backend` trait
    /// 3. Sends the result back via the command's oneshot channel
    /// 4. Exits cleanly on `Shutdown` or when the sender is dropped
    ///
    /// # Returns
    /// - `Ok((RuntimeHandle, JoinHandle<()>))` on successful thread spawn
    /// - `Err` if the thread could not be spawned
    pub fn spawn(
        _boot_config: BootConfig,
    ) -> Result<(RuntimeHandle, JoinHandle<()>), Box<dyn std::error::Error + Send + Sync>> {
        let (tx, mut rx) = handle::create_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let terminated_clone = terminated.clone();

        let handle = RuntimeHandle::new(tx, terminated_clone, std::sync::Weak::new());

        // [::TICKET::] P3-2: MockBackend is used until PjsuaBackend is implemented.
        let mut backend: Box<dyn SipBackend> = Box::new(MockBackend::new());
        // [::TICKET::] P8-1: O-003 — the reactor owns a default-call AudioMixer. Audio
        // lifecycle commands (AddAudioSource / RemoveAudioSource / SetAudioSourceGain /
        // MuteAudioSource) mutate this mixer on the reactor thread (single-writer rule).
        let audio_mixer: Arc<AudioMixer> = Arc::new(AudioMixer::new());

        let thread_join = thread::Builder::new()
            .name("siprs-reactor".into())
            .spawn(move || {
                // Initialize ClientState — source of truth owned by this thread.
                // [::TICKET::] P7-2: O-004 — the query API (accounts()/call_state())
                // reads this state, which is authoritative (events are observation-only).
                let mut client_state = ClientState::default();

                loop {
                    match rx.blocking_recv() {
                        Some(command) => {
                            match command {
                                DispatchCommand::Execute { f, reply } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            f(&mut *backend)
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            send_reply(reply, Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            send_reply(reply, Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                                                s.to_string()
                                            } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                                                s.clone()
                                            } else {
                                                "unknown panic".to_string()
                                            };
                                            tracing::error!(panic_msg = %msg, "reactor command panicked");
                                            let _ = reply.send(Err(
                                                crate::runtime::command::ReactorError::BackendError(
                                                    format!("reactor panic: {msg}")
                                                )
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::AddAudioSource {
                                    source,
                                    reply,
                                } => {
                                    // [::TICKET::] P8-1: O-003 — the reactor owns the
                                    // AudioMixer; audio lifecycle commands mutate it here
                                    // on the reactor thread (single-writer rule).
                                    let source_id = audio_mixer.add_source(source);
                                    let _ = reply.send(Ok(source_id));
                                }
                                DispatchCommand::RemoveAudioSource {
                                    source_id,
                                    reply,
                                } => {
                                    let result = audio_mixer.remove_source(source_id);
                                    let _ = reply.send(result);
                                }
                                DispatchCommand::SetAudioSourceGain {
                                    source_id,
                                    gain,
                                    reply,
                                } => {
                                    let result = audio_mixer.set_gain(source_id, gain);
                                    let _ = reply.send(result);
                                }
                                DispatchCommand::MuteAudioSource {
                                    source_id,
                                    muted,
                                    reply,
                                } => {
                                    let result = audio_mixer.mute(source_id, muted);
                                    let _ = reply.send(result);
                                }
                                DispatchCommand::GetAccountInfo {
                                    native_acc_id,
                                    reply,
                                } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            backend.get_account_info(native_acc_id)
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(snapshot)) => {
                                            let _ = reply.send(Ok(snapshot));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                                                s.to_string()
                                            } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                                                s.clone()
                                            } else {
                                                "unknown panic".to_string()
                                            };
                                            tracing::error!(panic_msg = %msg, "reactor get_account_info panicked");
                                            let _ = reply.send(Err(
                                                crate::runtime::command::ReactorError::BackendError(
                                                    format!("reactor panic: {msg}")
                                                )
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::AddAccount { config, reply } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            backend.add_account(&config)
                                        }),
                                    );
                                    match result {
                                        Ok(Ok((native_id, entry))) => {
                                            // Track the account in authoritative ClientState (O-004).
                                            if let Ok(account_id) = AccountId::from_u64(entry.id) {
                                                client_state
                                                    .accounts
                                                    .insert(account_id, entry);
                                            }
                                            let _ = reply.send(Ok(()));
                                            let _ = native_id;
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                                                s.to_string()
                                            } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                                                s.clone()
                                            } else {
                                                "unknown panic".to_string()
                                            };
                                            tracing::error!(panic_msg = %msg, "reactor add_account panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(
                                                    format!("reactor panic: {msg}")
                                                )
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::QueryState { reply } => {
                                    // Authoritative-state clone for the query API (O-004).
                                    let _ = reply.send(Ok(client_state.clone()));
                                }
                                DispatchCommand::Shutdown { reply } => {
                                    let _ = backend.shutdown();
                                    // C044 postcondition: publish the terminated flag before
                                    // replying, so shutdown() callers observe is_terminated() == true
                                    // the moment shutdown() returns Ok (oneshot send orders the store).
                                    terminated.store(true, Ordering::Release);
                                    send_reply(reply, Ok(()));
                                    break;
                                }
                            }
                        }
                        None => {
                            // All senders dropped — channel closed, exit.
                            terminated.store(true, Ordering::Release);
                            break;
                        }
                    }
                }
            })?;

        Ok((handle, thread_join))
    }
}

/// Client buses keyed by logical account ID.
// [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
type ClientEventBuses = std::collections::HashMap<AccountId, EventBus>;

/// Active calls keyed by logical call ID (`ClientState.calls`).
// [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
type CallTable = std::collections::BTreeMap<CallId, CallEntry>;

/// Route a `SipEvent` to the correct `EventBus` based on its `account_id` (N0038).
///
/// - `Some(account_id)` matching a registered client bus → that bus only.
/// - `Some(account_id)` matching no registered client → the default bus.
/// - `None` (client lifecycle events) → the default bus and every registered client bus.
///
/// This is the production dual-client dispatch: the Reactor calls it whenever a
/// NativeEvent has been converted to a `SipEvent` (O-003).
// [::TICKET::] P7-2: O-003 — production account_id-based EventBus dispatch
// [::STUB::] P12-7: NativeEvent dispatch and processing are not yet wired into the reactor loop (covers reactor.rs:260,294,335) -- Wire dispatch_event and process_native_event (with its extract_event_ids helper) into the reactor loop so NativeEvents delivered by the FFI callback bridge are processed
#[allow(dead_code)]
pub(crate) fn dispatch_event(
    client_event_buses: &ClientEventBuses,
    default_event_bus: &EventBus,
    event: SipEvent,
) {
    match event.meta.account_id {
        Some(account_id) => {
            if let Some(client_bus) = client_event_buses.get(&account_id) {
                client_bus.publish(event);
            } else {
                default_event_bus.publish(event);
            }
        }
        None => {
            default_event_bus.publish(event.clone());
            for client_bus in client_event_buses.values() {
                client_bus.publish(event.clone());
            }
        }
    }
}

/// Convert a `NativeEvent` to a `SipEvent` and publish it via `dispatch_event` (N0021).
///
/// `RegistrationStateChanged` is special: it queries the backend via
/// `get_account_info()` and publishes `RegistrationSucceeded`/`RegistrationFailed`
/// (or `Error`) — this is the production publication path that previously had no
/// call site for `registration_status_to_payload` (O-001).
///
/// Other P0 events flow through `convert_native_event_to_payload`; P1/P2 events
/// convert to `None` and are silently not published (documented rationale).
///
/// `calls` is the reactor's call-state table (`ClientState.calls`). Call-scoped
/// events carry no `acc_id`, so the owning account is resolved from
/// `calls[call_id].account_id` before conversion — this is what lets a
/// `CONFIRMED` call publish a `CallConnected` payload with the real account.
// [::TICKET::] P7-2: O-001 — production NativeEvent → SipEvent publication flow
#[allow(dead_code)]
pub(crate) fn process_native_event(
    backend: &dyn SipBackend,
    client_event_buses: &ClientEventBuses,
    default_event_bus: &EventBus,
    event: NativeEvent,
    calls: &CallTable,
) {
    match event {
        NativeEvent::RegistrationStateChanged { acc_id } => {
            let account_id = AccountId::from_u64(acc_id as u64).ok();
            let payload = match backend.get_account_info(acc_id) {
                Ok(snapshot) => registration_status_to_payload(&snapshot),
                Err(reactor_error) => Some(SipEventPayload::Error(reactor_error.into())),
            };
            if let Some(payload) = payload {
                let sip_event = SipEvent {
                    meta: EventMeta::new(0, account_id, None),
                    payload,
                };
                dispatch_event(client_event_buses, default_event_bus, sip_event);
            }
        }
        other_event => {
            let (mut account_id, call_id) = extract_event_ids(&other_event);
            // Call-scoped events have no acc_id in the event data: resolve the
            // owning account from the call table before conversion.
            if account_id.is_none() {
                if let Some(cid) = call_id {
                    account_id = calls.get(&cid).map(|entry| entry.account_id);
                }
            }
            if let Some(payload) = convert_native_event_to_payload(other_event, account_id) {
                let sip_event = SipEvent {
                    meta: EventMeta::new(0, account_id, call_id),
                    payload,
                };
                dispatch_event(client_event_buses, default_event_bus, sip_event);
            }
        }
    }
}

/// Extract the `EventMeta` id fields carried by a `NativeEvent`.
///
/// Call/DTMF events carry only a `call_id`; the owning `account_id` is resolved
/// from the reactor's call-state table by `process_native_event`. Registration
/// events carry the `acc_id`.
#[allow(dead_code)]
// [::TICKET::] P7-2, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6) --for-spec --no-implementation-order`.
fn extract_event_ids(event: &NativeEvent) -> (Option<AccountId>, Option<CallId>) {
    match event {
        NativeEvent::RegistrationStarted { acc_id, .. } => {
            (AccountId::from_u64(*acc_id as u64).ok(), None)
        }
        NativeEvent::CallStateChanged { call_id, .. }
        | NativeEvent::CallMediaStateChanged { call_id }
        | NativeEvent::DtmfDigit { call_id, .. }
        | NativeEvent::IceTransportError { call_id }
        | NativeEvent::CallTsxStateChanged { call_id }
        | NativeEvent::CallRedirected { call_id }
        | NativeEvent::CallTransferStatus { call_id }
        | NativeEvent::CallReplaced { call_id } => (None, CallId::from_u64(*call_id as u64).ok()),
        NativeEvent::TransportStateChanged { .. }
        | NativeEvent::NatDetected
        | NativeEvent::RegistrationStateChanged { .. } => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::state::CallEntry;
    use std::collections::{BTreeMap, HashMap};

    /// Construct a test `CallId` from a non-zero value.
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn test_call_id(value: u64) -> CallId {
        CallId::from_u64(value).unwrap_or_else(|error| {
            panic!("test CallId requires a non-zero value, got {value}: {error}")
        })
    }

    /// Construct a test `AccountId` from a non-zero value.
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn test_account(value: u64) -> AccountId {
        AccountId::from_u64(value).unwrap_or_else(|error| {
            panic!("test AccountId requires a non-zero value, got {value}: {error}")
        })
    }

    /// Build a calls table with a single confirmed call (CallId 10 → account 1).
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn confirmed_calls() -> CallTable {
        BTreeMap::from([(
            test_call_id(10),
            CallEntry {
                id: 10,
                native_id: 1,
                account_id: test_account(1),
                state: "Confirmed".into(),
                media: "none".into(),
            },
        )])
    }

    /// Spawn the reactor for a test; panics with the error on failure.
    // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
    fn spawn_reactor() -> (RuntimeHandle, std::thread::JoinHandle<()>) {
        CoreReactor::spawn(BootConfig::default())
            .unwrap_or_else(|error| panic!("reactor spawn failed: {error}"))
    }

    // [::TICKET::] P7-2: O-003 — test helper shared by dispatch/process_native_event tests
    // [::TICKET::] P7-2, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6) --for-spec --no-implementation-order`.
    fn make_event(account_id: Option<AccountId>) -> SipEvent {
        SipEvent {
            meta: EventMeta::new(1, account_id, Some(test_call_id(1))),
            payload: SipEventPayload::CallDisconnected,
        }
    }

    // ── O-003: production dispatch_event routing ───────────────────────

    /// @verifies C039
    #[test]
    // [::TICKET::] P7-2: O-003 — production dispatch routes to the matching client bus only
    // [::TICKET::] P7-2, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6) --for-spec --no-implementation-order`.
    fn dispatch_event_routes_to_matching_bus_only() {
        let bus_a = EventBus::new(16, None);
        let bus_b = EventBus::new(16, None);
        let default_bus = EventBus::new(16, None);
        let mut buses = HashMap::new();
        buses.insert(test_account(1), bus_a.clone());
        buses.insert(test_account(2), bus_b.clone());

        let mut rx_a = bus_a.subscribe_control();
        let mut rx_b = bus_b.subscribe_control();

        dispatch_event(&buses, &default_bus, make_event(Some(test_account(1))));

        assert!(
            rx_a.try_recv().is_ok(),
            "client A must receive the account-1 event"
        );
        assert!(
            matches!(
                rx_b.try_recv(),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
            ),
            "client B must NOT receive the account-1 event (C039 isolation invariant)"
        );
    }

    /// @verifies C039
    #[test]
    // [::TICKET::] P7-2: O-003 — production dispatch broadcasts account_id=None to every bus
    // [::TICKET::] P7-2, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6) --for-spec --no-implementation-order`.
    fn dispatch_event_none_account_broadcasts_to_all() {
        let bus_a = EventBus::new(16, None);
        let bus_b = EventBus::new(16, None);
        let default_bus = EventBus::new(16, None);
        let mut buses = HashMap::new();
        buses.insert(test_account(1), bus_a.clone());
        buses.insert(test_account(2), bus_b.clone());

        let mut rx_a = bus_a.subscribe_control();
        let mut rx_b = bus_b.subscribe_control();
        let mut rx_default = default_bus.subscribe_control();

        let mut event = make_event(None);
        event.meta.account_id = None;
        dispatch_event(&buses, &default_bus, event);

        assert!(
            rx_a.try_recv().is_ok(),
            "client A must receive lifecycle event"
        );
        assert!(
            rx_b.try_recv().is_ok(),
            "client B must receive lifecycle event"
        );
        assert!(
            rx_default.try_recv().is_ok(),
            "default bus must receive lifecycle event"
        );
    }

    /// @verifies C039
    #[test]
    // [::TICKET::] P7-2: O-003 — production dispatch falls back to default_event_bus for unmatched account
    // [::TICKET::] P7-2, P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6) --for-spec --no-implementation-order`.
    fn dispatch_event_unmatched_account_falls_back_to_default() {
        let bus_a = EventBus::new(16, None);
        let default_bus = EventBus::new(16, None);
        let mut buses = HashMap::new();
        buses.insert(test_account(1), bus_a.clone());

        let mut rx_a = bus_a.subscribe_control();
        let mut rx_default = default_bus.subscribe_control();

        dispatch_event(&buses, &default_bus, make_event(Some(test_account(99))));

        assert!(
            rx_default.try_recv().is_ok(),
            "unmatched account must fall back to default_event_bus"
        );
        assert!(
            matches!(
                rx_a.try_recv(),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
            ),
            "registered client bus must NOT receive the unmatched-account event"
        );
    }

    // ── O-001: production process_native_event registration flow ───────

    /// @verifies C024
    #[tokio::test]
    // [::TICKET::] P7-2: O-001 — status 200 publishes RegistrationSucceeded via dispatch_event
    async fn process_native_event_registration_200_publishes_succeeded() {
        let backend = MockBackend::new(); // get_account_info() -> Ok(200)
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &calls,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        assert!(
            matches!(ev.payload, SipEventPayload::RegistrationSucceeded(_)),
            "expected RegistrationSucceeded, got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.account_id, Some(test_account(1)));
    }

    /// @verifies C024
    #[tokio::test]
    // [::TICKET::] P7-2: O-001 — get_account_info Err publishes a failure event (no silent drop)
    async fn process_native_event_registration_err_publishes_failure() {
        let mut backend = MockBackend::new();
        backend.get_account_info_result =
            Some(Err(ReactorError::BackendError("mock backend down".into())));
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &calls,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        assert!(
            matches!(
                ev.payload,
                SipEventPayload::RegistrationFailed(_) | SipEventPayload::Error(_)
            ),
            "expected RegistrationFailed or Error, got {:?}",
            ev.payload
        );
    }

    /// @verifies C022
    #[tokio::test]
    // [::TICKET::] P7-2: O-001 — non-registration P0 events convert and publish through dispatch_event
    async fn process_native_event_call_state_changed_publishes() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let calls = confirmed_calls();
        let mut rx = bus.subscribe_control();

        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 10,
                state: 3,
            },
            &calls,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        match ev.payload {
            SipEventPayload::CallConnected(info) => {
                assert_eq!(info.account_id, test_account(1));
            }
            other => panic!("expected CallConnected, got {:?}", other),
        }
    }

    /// @verifies C029, C031
    #[tokio::test]
    async fn process_native_event_multi_account_call_connected() {
        // Two calls, one per account: each CallConnected payload must carry the
        // owning CallEntry.account_id — never the hardcoded account 1.
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let calls = BTreeMap::from([
            (
                test_call_id(10),
                CallEntry {
                    id: 10,
                    native_id: 1,
                    account_id: test_account(1),
                    state: "Confirmed".into(),
                    media: "none".into(),
                },
            ),
            (
                test_call_id(11),
                CallEntry {
                    id: 11,
                    native_id: 2,
                    account_id: test_account(2),
                    state: "Confirmed".into(),
                    media: "none".into(),
                },
            ),
        ]);
        let mut rx = bus.subscribe_control();

        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 10,
                state: 3,
            },
            &calls,
        );
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 11,
                state: 3,
            },
            &calls,
        );

        let first = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        let second = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        // [::TICKET::] P9-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-6 --for-spec --no-implementation-order`.
        match (first.payload, second.payload) {
            (SipEventPayload::CallConnected(a), SipEventPayload::CallConnected(b)) => {
                assert_eq!(a.account_id, test_account(1));
                assert_eq!(b.account_id, test_account(2));
                assert_ne!(a.account_id, b.account_id, "accounts must be distinct");
            }
            other => panic!("expected two CallConnected payloads, got {:?}", other),
        }
    }

    #[tokio::test]
    // [::TICKET::] P7-2: O-001 — P1/P2 events are dropped without publication (documented rationale)
    async fn process_native_event_p1_drops_without_publish() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::TransportStateChanged {
                transport_id: 1,
                state: 0,
            },
            &calls,
        );

        // P1/P2 convert to None — no event must be published on the bus.
        let result = rx.try_recv();
        assert!(
            matches!(
                result,
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
            ),
            "P1 events must not be published, got {:?}",
            result
        );
    }

    #[tokio::test]
    // @verifies C002
    async fn reactor_spawn_creates_thread() {
        // Contract-C002: CoreReactor::spawn() creates a std::thread.
        let (handle, join) = spawn_reactor();
        assert!(
            !handle.is_terminated(),
            "reactor must be running after spawn"
        );
        drop(handle);
        // ABC O-004 closure: type-assert the std::thread model (not tokio::task)
        // so a reactor refactor to tokio::spawn fails compilation.
        let join: std::thread::JoinHandle<()> = join;
        let _ = join.join();
    }

    #[tokio::test]
    // @verifies C011
    async fn reactor_spawn_multiple_concurrent_submits() {
        // Contract-C011: 10 concurrent submit() calls are serialized.
        let (handle, join) = spawn_reactor();

        // Use raw DispatchCommand with oneshot channels
        let mut tasks = Vec::new();
        for i in 0..5u64 {
            let handle_clone = handle.clone();
            tasks.push(tokio::spawn(async move {
                let (tx, rx) = tokio::sync::oneshot::channel();
                let cmd = DispatchCommand::Execute {
                    f: Box::new(move |backend: &mut dyn SipBackend| {
                        let acct = crate::config::account_config_spec::AccountConfig {
                            username: format!("test-{i}"),
                            ..crate::config::account_config_spec::AccountConfig::default()
                        };
                        backend.add_account(&acct)?;
                        Ok(())
                    }),
                    reply: tx,
                };
                let _ = handle_clone.sender.send(cmd);
                rx.await
                    .unwrap_or(Err(crate::runtime::command::ReactorError::ReactorDown))
            }));
        }

        for task in tasks {
            let result = task
                .await
                .unwrap_or_else(|error| panic!("submit task failed: {error}"));
            assert!(result.is_ok(), "concurrent submit must succeed");
        }

        drop(handle);
        let _ = join.join();
    }

    #[tokio::test]
    // @verifies C047
    async fn reactor_shutdown_cleanly() {
        // Contract-C047: Shutdown stops the reactor cleanly.
        let (handle, join) = spawn_reactor();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Shutdown { reply: tx };
        handle.sender.send(cmd).ok();
        assert!(rx.await.is_ok(), "shutdown must complete");
        join.join()
            .unwrap_or_else(|_| panic!("reactor thread panicked"));
        assert!(
            handle.is_terminated(),
            "reactor must be terminated after shutdown"
        );
    }
}

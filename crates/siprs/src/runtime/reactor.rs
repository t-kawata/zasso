// [::TICKET::] P0-2: CoreReactor — dedicated thread for serialized PJSUA command execution

use std::collections::BTreeMap;
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
use crate::state::m20_callstate_mapping::{convert_call_state_with_previous, CallDirection};
use crate::state::m20_native_event_conv::{convert_native_event_to_payload, NativeEvent};
use crate::state::m20_registr_cmd_pat::registration_status_to_payload;

/// Name of the reactor OS thread. Used for diagnostics and by the FFI
/// thread-lifecycle observer (P8-21) to correlate thread ids with the reactor.
const REACTOR_THREAD_NAME: &str = "siprs-reactor";

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
// [::TICKET::] P6-1, P7-2, P8-1, P10-3, P10-4, P11-3, P11-6, P11-11, P12-6, P12-1, P12-7, P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P6-1|P7-2|P8-1|P10-3|P10-4|P11-3|P11-6|P11-11|P12-6|P12-1|P12-7|P12-8) --for-spec --no-implementation-order`.
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
    /// - `Ok((RuntimeHandle, Arc<JoinHandle<()>>))` on successful thread spawn
    /// - `Err` if the thread could not be spawned
    pub fn spawn(
        boot_config: BootConfig,
    ) -> Result<(RuntimeHandle, Arc<JoinHandle<()>>), Box<dyn std::error::Error + Send + Sync>>
    {
        let (tx, mut rx) = handle::create_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let terminated_clone = terminated.clone();

        // [::TICKET::] P3-2: MockBackend is used until PjsuaBackend is implemented.
        let mut backend: Box<dyn SipBackend> = Box::new(MockBackend::new());
        // [::TICKET::] P8-1: O-003 — the reactor owns a default-call AudioMixer. Audio
        // lifecycle commands (AddAudioSource / RemoveAudioSource / SetAudioSourceGain /
        // MuteAudioSource) mutate this mixer on the reactor thread (single-writer rule).
        let audio_mixer: Arc<AudioMixer> = Arc::new(AudioMixer::new());
        // [::TICKET::] P11-3: O-001 — expose a clone of the reactor mixer to the
        // handle so tests/observability can assert post-dispatch mixer state without
        // a round-trip command. The thread keeps its own Arc (single-writer rule).
        let mixer_for_handle = audio_mixer.clone();

        // [::TICKET::] P11-6: the reactor owns the default EventBus (the publish
        // target for reactor-initiated events such as the DtmfSent timeout) and the
        // per-account client bus map. Client buses are registered later (P9-6); for
        // this round the default bus is the only publish target.
        let default_event_bus = EventBus::new(
            crate::api::eventbus_receiver::DEFAULT_EVENT_BUS_CAPACITY,
            None,
        );
        // [::TICKET::] P12-6: the thread closure takes ownership of the bus; the
        // handle needs its own clone, taken BEFORE the thread spawn (thread-first).
        let default_event_bus_for_handle = default_event_bus.clone();
        let client_event_buses: ClientEventBuses = std::collections::HashMap::new();
        // [::TICKET::] P11-6: sent_timeout_ms drives the DtmfSent fallback timer (C030).
        let dtmf_sent_timeout_ms = boot_config.config.dtmf.sent_timeout_ms;

        // [::TICKET::] P11-6: the reactor owns a small tokio runtime that drives
        // the DtmfSent timeout fallback timers. It is built here (outside the
        // thread) so a build failure propagates as an Err instead of panicking
        // inside the reactor thread.
        let timer_runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) })?;

        let thread_join = thread::Builder::new()
            .name(REACTOR_THREAD_NAME.into())
            .spawn(move || {
                // Initialize ClientState — source of truth owned by this thread.
                // [::TICKET::] P7-2: O-004 — the query API (accounts()/call_state())
                // reads this state, which is authoritative (events are observation-only).
                let mut client_state = ClientState::default();
                // [::TICKET::] P12-8: reactor-owned call-origin direction map. Kept
                // out of CallEntry so the C046 field set (id/native_id/account_id/
                // state/media) stays fixed and conf_port_id remains absent.
                let mut call_directions: BTreeMap<CallId, CallDirection> = BTreeMap::new();

                // [::TICKET::] P11-6: `enter()` installs the reactor-owned timer
                // runtime as the current context on this std thread so
                // `spawn_dtmf_sent_timeout` (which uses `tokio::spawn`) works
                // without restructuring the loop.
                let _timer_enter = timer_runtime.enter();

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
                                            let msg = panic_message(&panic_payload);
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
                                DispatchCommand::SendDtmf {
                                    call_id,
                                    method,
                                    digits,
                                    reply,
                                } => {
                                    let mut ctx = SendDtmfContext {
                                        backend: &mut *backend,
                                        client_state: &client_state,
                                        client_event_buses: &client_event_buses,
                                        default_event_bus: &default_event_bus,
                                        sent_timeout_ms: dtmf_sent_timeout_ms,
                                    };
                                    let result =
                                        handle_send_dtmf(&mut ctx, call_id, method, &digits);
                                    send_reply(reply, result);
                                }
                                DispatchCommand::AddAudioSource {
                                    source,
                                    reply,
                                } => {
                                    // [::TICKET::] P8-1: O-003 — the reactor owns the
                                    // AudioMixer; audio lifecycle commands mutate it here
                                    // on the reactor thread (single-writer rule).
                                    let source_id = audio_mixer.add_source(source.into_inner());
                                    send_reply(reply, Ok(source_id));
                                }
                                DispatchCommand::RemoveAudioSource {
                                    source_id,
                                    reply,
                                } => {
                                    let result = audio_mixer.remove_source(source_id);
                                    send_reply(reply, result);
                                }
                                DispatchCommand::SetAudioSourceGain {
                                    source_id,
                                    gain,
                                    reply,
                                } => {
                                    let result = audio_mixer.set_gain(source_id, gain);
                                    send_reply(reply, result);
                                }
                                DispatchCommand::MuteAudioSource {
                                    source_id,
                                    muted,
                                    reply,
                                } => {
                                    let result = audio_mixer.mute(source_id, muted);
                                    send_reply(reply, result);
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
                                            let msg = panic_message(&panic_payload);
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
                                        Ok(Ok((_native_id, entry))) => {
                                            let entry_id = entry.id;
                                            // Track the account in authoritative ClientState (O-004).
                                            if let Ok(account_id) = AccountId::from_u64(entry_id) {
                                                client_state.accounts.insert(account_id, entry);
                                            }
                                            // Reply with the assigned logical id so the facade
                                            // can build a real SipAccountHandle (P10-3).
                                            let _ = reply.send(Ok(entry_id));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
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
                                DispatchCommand::MakeCall {
                                    account_id,
                                    request,
                                    reply,
                                } => {
                                    // [::TICKET::] P12-1: place the call, register the
                                    // CallEntry in the authoritative ClientState.calls, and
                                    // reply with the assigned CallId (C070). The reply is
                                    // sent exactly once on every outcome.
                                    let mut call_state = CallStateTables {
                                        calls: &mut client_state.calls,
                                        call_directions: &mut call_directions,
                                    };
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            handle_make_call(
                                                &mut *backend,
                                                &mut call_state,
                                                account_id,
                                                &request,
                                            )
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(entry_id)) => {
                                            let _ = reply.send(Ok(entry_id));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor make_call panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(
                                                    format!("reactor panic: {msg}")
                                                )
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::UpdateAccount {
                                    account_id,
                                    config,
                                    reply,
                                } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            let aid = AccountId::from_u64(account_id).map_err(|_| {
                                                ReactorError::NotInitialized(
                                                    "invalid account id".into(),
                                                )
                                            })?;
                                            let native_id = client_state
                                                .accounts
                                                .get(&aid)
                                                .ok_or_else(|| {
                                                    ReactorError::NotInitialized(
                                                        "account not found".into(),
                                                    )
                                                })?
                                                .native_id;
                                            backend.update_account(native_id, &config)
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            if let Ok(aid) = AccountId::from_u64(account_id) {
                                                if let Some(entry) =
                                                    client_state.accounts.get_mut(&aid)
                                                {
                                                    entry.config = config;
                                                }
                                            }
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor update_account panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(format!(
                                                    "reactor panic: {msg}"
                                                ))
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::RemoveAccount { account_id, reply } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            backend.remove_account(account_id as i32)
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            // Keep the authoritative ClientState in lockstep (C021).
                                            if let Ok(aid) = AccountId::from_u64(account_id) {
                                                client_state.accounts.remove(&aid);
                                            }
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor remove_account panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(format!(
                                                    "reactor panic: {msg}"
                                                ))
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::CreateTransport { config, reply } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            backend.create_transport(&config)
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            let (transport_type, port) = match &config {
                                                crate::config::transport_ice_spec::TransportConfig::Udp(c) => {
                                                    ("udp", c.bind_addr.port())
                                                }
                                                crate::config::transport_ice_spec::TransportConfig::Tcp(c) => {
                                                    ("tcp", c.bind_addr.port())
                                                }
                                                #[cfg(feature = "tls")]
                                                crate::config::transport_ice_spec::TransportConfig::Tls(c) => {
                                                    ("tls", c.bind_addr.port())
                                                }
                                            };
                                            client_state.transports.push(
                                                crate::runtime::state::TransportRuntimeState {
                                                    transport_id: (client_state.transports.len() + 1)
                                                        as i32,
                                                    transport_type: transport_type.to_string(),
                                                    port,
                                                },
                                            );
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor create_transport panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(format!(
                                                    "reactor panic: {msg}"
                                                ))
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::QueryState { reply } => {
                                    // Authoritative-state clone for the query API (O-004).
                                    let _ = reply.send(Ok(client_state.clone()));
                                }
                                DispatchCommand::NativeEvent { event } => {
                                    // O-001: on a native event, convert it and publish
                                    // to the owning EventBus. Backend errors surface as
                                    // SipEventPayload::Error — never crash the loop.
                                    let mut call_state = CallStateTables {
                                        calls: &mut client_state.calls,
                                        call_directions: &mut call_directions,
                                    };
                                    process_native_event(
                                        &*backend,
                                        &client_event_buses,
                                        &default_event_bus,
                                        event,
                                        &mut call_state,
                                    );
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
        let reactor_join = Arc::new(thread_join);

        let handle = RuntimeHandle::new(
            tx,
            terminated_clone,
            reactor_join.clone(),
            mixer_for_handle,
            default_event_bus_for_handle,
        );

        Ok((handle, reactor_join))
    }
}

/// Extract a readable message from a `catch_unwind` panic payload.
///
/// Panics may carry either a `&str` or a `String` message; anything else is
/// reported generically. Shared by every reactor loop arm so the panic-handling
/// block reads as a single sentence instead of a repeated downcast chain.
// [::TICKET::] P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-7 --for-spec --no-implementation-order`.
fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_string()
    }
}

/// Client buses keyed by logical account ID.
// [::TICKET::] P9-6, P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P12-8) --for-spec --no-implementation-order`.
type ClientEventBuses = std::collections::HashMap<AccountId, EventBus>;

/// Active calls keyed by logical call ID (`ClientState.calls`).
// [::TICKET::] P9-6, P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P12-8) --for-spec --no-implementation-order`.
type CallTable = std::collections::BTreeMap<CallId, CallEntry>;

/// Reactor-owned call-state tables passed to call-state handlers.
///
/// Bundles the `CallId`-keyed `calls` table and the call-origin `call_directions`
/// map so handler signatures stay under the param-count limit — the same
/// bundling precedent as `SendDtmfContext`.
// [::TICKET::] P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-8 --for-spec --no-implementation-order`.
pub(crate) struct CallStateTables<'a> {
    pub calls: &'a mut CallTable,
    pub call_directions: &'a mut BTreeMap<CallId, CallDirection>,
}

/// Route a `SipEvent` to the correct `EventBus` based on its `account_id` (N0038).
///
/// - `Some(account_id)` matching a registered client bus → that bus only.
/// - `Some(account_id)` matching no registered client → the default bus.
/// - `None` (client lifecycle events) → the default bus and every registered client bus.
///
/// This is the production dual-client dispatch: the Reactor calls it whenever a
/// NativeEvent has been converted to a `SipEvent` (O-003).
// [::TICKET::] P7-2: O-003 — production account_id-based EventBus dispatch
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
pub(crate) fn process_native_event(
    backend: &dyn SipBackend,
    client_event_buses: &ClientEventBuses,
    default_event_bus: &EventBus,
    event: NativeEvent,
    call_state: &mut CallStateTables<'_>,
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
            // Record the call origin before conversion: an inbound INVITE implies
            // CallDirection::Incoming (C039 provenance — never read from payload).
            if let NativeEvent::IncomingCall { call_id, .. } = &other_event {
                if let Ok(cid) = CallId::from_u64(*call_id as u64) {
                    call_state.call_directions.insert(cid, CallDirection::Incoming);
                }
            }
            let (mut account_id, call_id) = extract_event_ids(&other_event);
            // Call-scoped events have no acc_id in the event data: resolve the
            // owning account from the call table before conversion.
            if account_id.is_none() {
                if let Some(cid) = call_id {
                    account_id = call_state.calls.get(&cid).map(|entry| entry.account_id);
                }
            }
            let payload = match other_event {
                // CONNECTING is direction-sensitive: resolve the call origin and
                // discriminate Trying (outgoing) vs Ringing (incoming).
                NativeEvent::CallStateChanged { call_id, state } => {
                    CallId::from_u64(call_id as u64).ok().and_then(|cid| {
                        let direction = resolve_call_direction(cid, call_state.call_directions);
                        convert_call_state_with_previous(cid, account_id, state, direction)
                    })
                }
                other => convert_native_event_to_payload(other, account_id),
            };
            if let Some(payload) = payload {
                let sip_event = SipEvent {
                    meta: EventMeta::new(0, account_id, call_id),
                    payload,
                };
                dispatch_event(client_event_buses, default_event_bus, sip_event);
            }
        }
    }
}

/// Resolve the call's origin direction, defaulting to `Outgoing` — the same
/// assumption `convert_call_state` applied before P12-8 introduced direction
/// context (a state change of unknown origin is treated as an outbound call).
// [::TICKET::] P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-8 --for-spec --no-implementation-order`.
fn resolve_call_direction(
    call_id: CallId,
    call_directions: &BTreeMap<CallId, CallDirection>,
) -> CallDirection {
    call_directions
        .get(&call_id)
        .copied()
        .unwrap_or(CallDirection::Outgoing)
}

/// Extract the `EventMeta` id fields carried by a `NativeEvent`.
///
/// Call/DTMF events carry only a `call_id`; the owning `account_id` is resolved
/// from the reactor's call-state table by `process_native_event`. Registration
/// events carry the `acc_id`.
// [::TICKET::] P7-2, P9-6, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6|P11-11) --for-spec --no-implementation-order`.
fn extract_event_ids(event: &NativeEvent) -> (Option<AccountId>, Option<CallId>) {
    match event {
        NativeEvent::RegistrationStarted { acc_id, .. } => {
            (AccountId::from_u64(*acc_id as u64).ok(), None)
        }
        NativeEvent::IncomingCall { acc_id, call_id } => (
            AccountId::from_u64(*acc_id as u64).ok(),
            CallId::from_u64(*call_id as u64).ok(),
        ),
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

/// Reactor-owned dependencies a command handler needs to publish events.
///
/// Bundling them keeps `handle_send_dtmf` under the clippy argument-count limit
/// and reads as "handle the command with the reactor context" (translatability).
pub(crate) struct SendDtmfContext<'a> {
    backend: &'a mut dyn SipBackend,
    client_state: &'a ClientState,
    client_event_buses: &'a ClientEventBuses,
    default_event_bus: &'a EventBus,
    sent_timeout_ms: u64,
}

/// Handle a `MakeCall` command on the reactor thread.
///
/// Delegates to the backend, registers the returned `CallEntry` in the reactor's
/// authoritative `ClientState.calls` (C046), and returns the assigned logical
/// CallId. Extracted as a helper so the error path is unit-testable with a
/// failing MockBackend (mirrors `handle_send_dtmf`).
///
/// Reads as prose: place the call via the backend; on success register the call
/// entry under its CallId, record its outgoing origin, and returns that id; on
/// backend error propagate.
pub(crate) fn handle_make_call(
    backend: &mut dyn SipBackend,
    call_state: &mut CallStateTables<'_>,
    account_id: u64,
    request: &crate::api::call_types::OutgoingCallRequest,
) -> Result<u64, ReactorError> {
    let (_native_id, entry) = backend.make_call(account_id as i32, request)?;
    let entry_id = entry.id;
    if let Ok(call_id) = CallId::from_u64(entry_id) {
        call_state.calls.insert(call_id, entry);
        // A MakeCall command is an outgoing call by origin (C046 provenance).
        call_state.call_directions.insert(call_id, CallDirection::Outgoing);
    }
    Ok(entry_id)
}

/// Handle a `RuntimeCommand::SendDtmf` on the reactor thread.
///
/// Reads as prose: send via the backend; on success resolve the owning account,
/// convert the method, and spawn one `spawn_dtmf_sent_timeout` per digit that
/// publishes `DtmfSent { Err(Timeout) }` to the reactor-owned bus; on backend
/// error propagate and spawn nothing (two-phase C030 preserved).
pub(crate) fn handle_send_dtmf(
    ctx: &mut SendDtmfContext<'_>,
    call_id: u64,
    method: crate::config::account_config_spec::DtmfMethod,
    digits: &str,
) -> Result<(), ReactorError> {
    let call_id_typed = CallId::from_u64(call_id)
        .map_err(|_| ReactorError::BackendError("invalid call id 0".into()))?;
    ctx.backend.send_dtmf(call_id as i32, &method, digits)?;
    let account_id = ctx
        .client_state
        .calls
        .get(&call_id_typed)
        .map(|entry| entry.account_id);
    let target_bus = account_id
        .and_then(|aid| ctx.client_event_buses.get(&aid).cloned())
        .unwrap_or_else(|| ctx.default_event_bus.clone());
    let m20_method = crate::api::m20_dtmfsent_twophase::DtmfMethod::from(method);
    for digit in digits.chars() {
        let _timer = crate::api::m20_dtmfsent_twophase::spawn_dtmf_sent_timeout(
            crate::api::m20_dtmfsent_twophase::DtmfSentTimeoutRequest {
                call_id: call_id_typed,
                account_id,
                method: m20_method,
                digit,
                timeout_ms: ctx.sent_timeout_ms,
                event_bus: target_bus.clone(),
            },
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::command::Reply;
    use crate::runtime::state::CallEntry;
    use crate::state::m20_callstate_mapping::pjsip_inv_state;
    use crate::state::m20_registr_cmd_pat::AccountInfoSnapshot;
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
    // [::TICKET::] P11-9, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-9|P11-11) --for-spec --no-implementation-order`.
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

    /// An empty call-origin direction map, shared by process_native_event tests.
    // [::TICKET::] P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-8 --for-spec --no-implementation-order`.
    fn empty_directions() -> BTreeMap<CallId, CallDirection> {
        BTreeMap::new()
    }

    /// Spawn the reactor for a test; panics with the error on failure.
    // [::TICKET::] P9-6, P12-6, P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-6|P12-6|P12-1) --for-spec --no-implementation-order`.
    fn spawn_reactor() -> (RuntimeHandle, Arc<std::thread::JoinHandle<()>>) {
        CoreReactor::spawn(BootConfig::default())
            .unwrap_or_else(|error| panic!("reactor spawn failed: {error}"))
    }

    /// Join the reactor thread, releasing the handle's strong ref to the shared
    /// Arc first. `handle` must be the LAST live RuntimeHandle — its ref is
    /// dropped here so `Arc::try_unwrap` can recover the inner JoinHandle.
    // [::TICKET::] P12-6, P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-6|P12-1) --for-spec --no-implementation-order`.
    fn join_reactor(handle: RuntimeHandle, join: Arc<std::thread::JoinHandle<()>>) {
        drop(handle);
        let join = Arc::try_unwrap(join).expect("no other RuntimeHandle may hold the Arc");
        join.join().unwrap();
    }

    // [::TICKET::] P7-2: O-003 — test helper shared by dispatch/process_native_event tests
    // [::TICKET::] P7-2, P9-6, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6|P12-7) --for-spec --no-implementation-order`.
    fn make_disconnect_event(account_id: Option<AccountId>) -> SipEvent {
        SipEvent {
            meta: EventMeta::new(1, account_id, Some(test_call_id(1))),
            payload: SipEventPayload::CallDisconnected,
        }
    }

    // ── O-003: production dispatch_event routing ───────────────────────

    /// @verifies C039
    #[test]
    // [::TICKET::] P7-2: O-003 — production dispatch routes to the matching client bus only
    // [::TICKET::] P7-2, P9-6, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6|P12-7) --for-spec --no-implementation-order`.
    fn dispatch_event_routes_to_matching_bus_only() {
        let bus_a = EventBus::new(16, None);
        let bus_b = EventBus::new(16, None);
        let default_bus = EventBus::new(16, None);
        let mut buses = HashMap::new();
        buses.insert(test_account(1), bus_a.clone());
        buses.insert(test_account(2), bus_b.clone());

        let mut rx_a = bus_a.subscribe_control();
        let mut rx_b = bus_b.subscribe_control();

        dispatch_event(
            &buses,
            &default_bus,
            make_disconnect_event(Some(test_account(1))),
        );

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
    // [::TICKET::] P7-2, P9-6, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6|P12-7) --for-spec --no-implementation-order`.
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

        let mut event = make_disconnect_event(None);
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
    // [::TICKET::] P7-2, P9-6, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P9-6|P12-7) --for-spec --no-implementation-order`.
    fn dispatch_event_unmatched_account_falls_back_to_default() {
        let bus_a = EventBus::new(16, None);
        let default_bus = EventBus::new(16, None);
        let mut buses = HashMap::new();
        buses.insert(test_account(1), bus_a.clone());

        let mut rx_a = bus_a.subscribe_control();
        let mut rx_default = default_bus.subscribe_control();

        dispatch_event(
            &buses,
            &default_bus,
            make_disconnect_event(Some(test_account(99))),
        );

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
    async fn process_native_event_registration_200_publishes_succeeded(
    ) -> Result<(), Box<dyn std::error::Error>> {
        // [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
        // P10-1: the snapshot is registry-derived — register an account first so
        // get_account_info(1) yields the Ok(200) success shape.
        let mut backend = MockBackend::new();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..crate::config::account_config_spec::AccountConfig::default()
        };
        backend.add_account(&config)?;
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let mut calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
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
        Ok(())
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
        let mut calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
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

    /// @verifies C024
    #[tokio::test]
    // [::TICKET::] P10-6: O-001 — non-200 Ok snapshot (403) publishes RegistrationFailed via the production flow
    // [::TICKET::] P10-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-6 --for-spec --no-implementation-order`.
    async fn process_native_event_registration_403_publishes_failed() {
        // C024: a non-200 registration status must be published as RegistrationFailed
        // through the production path, not just the isolated status mapping
        // exercised by the registration_status_to_payload unit tests (ABC O-001).
        let mut backend = MockBackend::new();
        backend.get_account_info_result = Some(Ok(AccountInfoSnapshot {
            acc_id: test_account(1),
            registration_status: 403,
            registration_expires: None,
            online_status: false,
            uri: "sip:alice@example.com".into(),
        }));
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let mut calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        match &ev.payload {
            SipEventPayload::RegistrationFailed(failure) => {
                assert_eq!(failure.status_code, 403);
                assert_eq!(ev.meta.account_id, Some(test_account(1)));
            }
            other => panic!("expected RegistrationFailed, got {other:?}"),
        }
    }

    /// @verifies C022
    #[tokio::test]
    // [::TICKET::] P7-2: O-001 — non-registration P0 events convert and publish through dispatch_event
    async fn process_native_event_call_state_changed_publishes() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let buses = HashMap::new();
        let mut calls = confirmed_calls();
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 10,
                state: pjsip_inv_state::CONFIRMED,
            },
            &mut call_state,
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
        let mut calls = BTreeMap::from([
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

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 10,
                state: pjsip_inv_state::CONFIRMED,
            },
            &mut call_state,
        );
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 11,
                state: pjsip_inv_state::CONFIRMED,
            },
            &mut call_state,
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
        let mut calls = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &buses,
            &bus,
            NativeEvent::TransportStateChanged {
                transport_id: 1,
                state: 0,
            },
            &mut call_state,
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

    // ── P12-8: CallDirection discrimination in the reactor call-state path ─

    /// @verifies C039, C046
    #[tokio::test]
    // [::TICKET::] P12-8: inbound CONNECTING discriminates to OutgoingCallRinging
    async fn process_native_event_incoming_connecting_rings() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::from([(
            test_call_id(7),
            CallEntry {
                id: 7,
                native_id: 1,
                account_id: test_account(42),
                state: "Connecting".into(),
                media: "none".into(),
            },
        )]);
        let mut directions = BTreeMap::from([(test_call_id(7), CallDirection::Incoming)]);

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &HashMap::new(),
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 7,
                state: pjsip_inv_state::CONNECTING,
            },
            &mut call_state,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("CONNECTING event must be published: {error}"));
        assert!(
            matches!(ev.payload, SipEventPayload::OutgoingCallRinging),
            "inbound CONNECTING must publish OutgoingCallRinging, got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.call_id, Some(test_call_id(7)));
        assert_eq!(ev.meta.account_id, Some(test_account(42)));
    }

    /// @verifies C039, C046
    #[tokio::test]
    // [::TICKET::] P12-8: outbound CONNECTING discriminates to OutgoingCallTrying
    async fn process_native_event_outgoing_connecting_tries() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::from([(
            test_call_id(7),
            CallEntry {
                id: 7,
                native_id: 1,
                account_id: test_account(42),
                state: "Connecting".into(),
                media: "none".into(),
            },
        )]);
        let mut directions = BTreeMap::from([(test_call_id(7), CallDirection::Outgoing)]);

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &HashMap::new(),
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 7,
                state: pjsip_inv_state::CONNECTING,
            },
            &mut call_state,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("CONNECTING event must be published: {error}"));
        assert!(
            matches!(ev.payload, SipEventPayload::OutgoingCallTrying),
            "outbound CONNECTING must publish OutgoingCallTrying, got {:?}",
            ev.payload
        );
    }

    /// @verifies C039, C046
    #[tokio::test]
    // [::TICKET::] P12-8: CONNECTING with no recorded direction falls back to Trying (outgoing assumption)
    async fn process_native_event_connecting_no_direction_falls_back_to_trying() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::from([(
            test_call_id(7),
            CallEntry {
                id: 7,
                native_id: 1,
                account_id: test_account(42),
                state: "Connecting".into(),
                media: "none".into(),
            },
        )]);
        let mut directions = BTreeMap::new();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &HashMap::new(),
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 7,
                state: pjsip_inv_state::CONNECTING,
            },
            &mut call_state,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("CONNECTING event must be published: {error}"));
        assert!(
            matches!(ev.payload, SipEventPayload::OutgoingCallTrying),
            "unknown direction must fall back to OutgoingCallTrying, got {:?}",
            ev.payload
        );
    }

    /// @verifies C039
    #[tokio::test]
    // [::TICKET::] P12-8: processing NativeEvent::IncomingCall records the Incoming direction
    async fn process_native_event_incoming_call_records_direction() {
        let backend = MockBackend::new();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::new();
        let mut directions = empty_directions();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &HashMap::new(),
            &bus,
            NativeEvent::IncomingCall {
                acc_id: 42,
                call_id: 7,
            },
            &mut call_state,
        );

        // The IncomingCall event must be published (existing behavior) AND the
        // origin must be recorded so a later CONNECTING discriminates to Ringing.
        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("IncomingCall event must be published: {error}"));
        assert!(matches!(ev.payload, SipEventPayload::IncomingCall(_)));
        assert_eq!(
            directions.get(&test_call_id(7)),
            Some(&CallDirection::Incoming),
            "IncomingCall origin must be recorded as Incoming (C039 provenance)"
        );
    }

    /// @verifies C070, C046
    #[test]
    // [::TICKET::] P12-8: a MakeCall command records the outgoing direction by origin
// [::TICKET::] P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-8 --for-spec --no-implementation-order`.
    fn handle_make_call_records_outgoing_direction() {
        let mut backend = MockBackend::new();
        let mut client_state = ClientState::default();
        let mut directions = empty_directions();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut directions,
        };
        let id = handle_make_call(&mut backend, &mut call_state, 1, &test_call_request())
            .unwrap_or_else(|error| panic!("make_call must succeed: {error}"));
        assert_eq!(
            directions.get(&test_call_id(id)),
            Some(&CallDirection::Outgoing),
            "MakeCall origin must be recorded as Outgoing (C046 provenance)"
        );
    }

    #[test]
    // @verifies C051
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn extract_event_ids_incoming_call_carries_both_ids() {
        let (account_id, call_id) = extract_event_ids(&NativeEvent::IncomingCall {
            acc_id: 42,
            call_id: 7,
        });
        assert_eq!(account_id, Some(test_account(42)));
        assert_eq!(call_id, Some(test_call_id(7)));
    }

    #[test]
    // @verifies C051
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn extract_event_ids_incoming_call_zero_acc_id_yields_none() {
        let (account_id, call_id) = extract_event_ids(&NativeEvent::IncomingCall {
            acc_id: 0,
            call_id: 7,
        });
        assert_eq!(account_id, None, "acc_id 0 is the invalid sentinel");
        assert_eq!(call_id, Some(test_call_id(7)));
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
        assert!(
            handle.is_thread_alive(),
            "reactor thread must be alive right after spawn"
        );
        drop(handle);
        // ABC O-004 closure: type-assert the std::thread model (not tokio::task)
        // so a reactor refactor to tokio::spawn fails compilation.
        let join: Arc<std::thread::JoinHandle<()>> = join;
        let join = Arc::try_unwrap(join).expect("no other RuntimeHandle may hold the Arc");
        let _ = join.join();
    }

    #[tokio::test]
    // @verifies C112
    // [::TICKET::] P12-6: spawn returns an Arc sharing the reactor thread with the handle.
    async fn reactor_spawn_returns_arc_sharing_reactor_thread() {
        let (handle, join) = spawn_reactor();
        assert!(
            Arc::ptr_eq(handle.thread_handle(), &join),
            "handle and caller must share the identical Arc<JoinHandle> allocation"
        );
        assert_eq!(
            handle.thread_handle().thread().id(),
            join.thread().id(),
            "handle and caller must refer to the same OS thread"
        );
        assert!(handle.is_thread_alive());
        shutdown_reactor(handle, join).await;
    }

    #[tokio::test]
    // @verifies C046
    // [::TICKET::] P12-6: dropping all RuntimeHandle clones must NOT terminate the
    // reactor thread — the OS thread's lifecycle is independent of the Arc refcount
    // and ends only on Shutdown / panic / channel-close.
    async fn dropping_all_handles_does_not_terminate_reactor_thread() {
        let (handle, join) = spawn_reactor();
        let cloned = handle.clone();
        drop(cloned);
        assert!(
            !join.is_finished(),
            "reactor must survive dropping a cloned RuntimeHandle"
        );
        // Drop the last handle: the MPSC sender closes and the reactor loop exits
        // via channel-close (None from blocking_recv), NOT via the Arc refcount.
        drop(handle);
        let join = Arc::try_unwrap(join).expect("no other RuntimeHandle may hold the Arc");
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
                    reply: Reply::new(tx),
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
        let join = Arc::try_unwrap(join).expect("no other RuntimeHandle may hold the Arc");
        let _ = join.join();
    }

    #[tokio::test]
    // @verifies C047
    async fn reactor_shutdown_cleanly() {
        // Contract-C047: Shutdown stops the reactor cleanly.
        let (handle, join) = spawn_reactor();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Shutdown {
            reply: Reply::new(tx),
        };
        handle.sender.send(cmd).ok();
        assert!(rx.await.is_ok(), "shutdown must complete");
        // The terminated flag is set while the reactor processes Shutdown, so it
        // is true before the thread exits; assert it here because join_reactor
        // consumes the handle.
        assert!(
            handle.is_terminated(),
            "reactor must be terminated after shutdown"
        );
        join_reactor(handle, join);
    }

    // ── P10-3: account/transport lifecycle dispatch keeps ClientState authoritative ──

    /// Shut the reactor down cleanly (used by the lifecycle tests below).
    ///
    /// Takes the handle by value so its strong ref to the JoinHandle Arc is
    /// released, letting `Arc::try_unwrap` recover the inner handle to join.
    // [::TICKET::] P12-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-6 --for-spec --no-implementation-order`.
    async fn shutdown_reactor(handle: RuntimeHandle, join: Arc<std::thread::JoinHandle<()>>) {
        let (tx, rx) = tokio::sync::oneshot::channel();
        handle
            .sender
            .send(DispatchCommand::Shutdown {
                reply: Reply::new(tx),
            })
            .ok();
        let _ = rx.await;
        join_reactor(handle, join);
    }

    // ── P11-6: reactor-owned default_event_bus + SendDtmf two-phase wiring ──

    #[tokio::test]
    // @verifies C069
    // [::TICKET::] P11-6: reactor exposes the owned default_event_bus on the RuntimeHandle
    async fn reactor_exposes_default_event_bus() {
        let (handle, join) = spawn_reactor();
        let bus = handle.default_event_bus();
        let mut rx = bus.subscribe_control();
        bus.publish(SipEvent {
            meta: EventMeta::new(0, None, Some(test_call_id(1))),
            payload: SipEventPayload::CallDisconnected,
        });
        assert!(
            matches!(
                rx.try_recv().unwrap().payload,
                SipEventPayload::CallDisconnected
            ),
            "publishing on the reactor-owned bus must reach a subscriber"
        );
        shutdown_reactor(handle, join).await;
    }

    #[tokio::test]
    // @verifies C030
    // [::TICKET::] P11-6: SendDtmf dispatch spawns the timeout after backend success
    async fn send_dtmf_dispatch_spawns_timeout_after_backend_ok() {
        let mut config = ClientConfig::default();
        config.dtmf.sent_timeout_ms = 50;
        let (handle, join) = CoreReactor::spawn(BootConfig { config }).unwrap();
        let mut rx = handle.default_event_bus().subscribe_control();

        let (tx, _rx) = tokio::sync::oneshot::channel();
        let result = handle
            .submit(crate::runtime::command::RuntimeCommand::SendDtmf {
                call_id: 1,
                method: crate::config::account_config_spec::DtmfMethod::Rfc2833,
                digits: "5".into(),
                reply: crate::runtime::command::Reply::new(tx),
            })
            .await;
        assert!(
            result.is_ok(),
            "send_dtmf() returns Ok(()) for command acceptance"
        );

        let ev = tokio::time::timeout(std::time::Duration::from_millis(1000), rx.recv())
            .await
            .expect("DtmfSent Timeout must arrive on the reactor bus")
            .unwrap();
        match ev.payload {
            SipEventPayload::DtmfSent(info) => {
                assert!(matches!(
                    info.status,
                    Err(crate::api::m20_dtmfsent_twophase::SentDtmfError::Timeout)
                ));
                assert_eq!(info.digit, '5');
            }
            _ => panic!("expected DtmfSent, got {:?}", ev.payload),
        }
        shutdown_reactor(handle, join).await;
    }

    #[tokio::test]
    // @verifies C030
    // [::TICKET::] P11-6: handle_send_dtmf spawns the timeout on backend success (deterministic)
    async fn handle_send_dtmf_spawns_timeout_on_backend_ok() {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut backend = MockBackend::new();
        let client_state = ClientState::default();
        let client_event_buses: ClientEventBuses = std::collections::HashMap::new();

        let mut ctx = SendDtmfContext {
            backend: &mut backend,
            client_state: &client_state,
            client_event_buses: &client_event_buses,
            default_event_bus: &bus,
            sent_timeout_ms: crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS,
        };
        let result = handle_send_dtmf(
            &mut ctx,
            1,
            crate::config::account_config_spec::DtmfMethod::Rfc2833,
            "5",
        );
        assert!(result.is_ok(), "backend success must return Ok(())");

        tokio::time::advance(std::time::Duration::from_millis(500)).await;
        let ev = rx.recv().await.unwrap();
        if let SipEventPayload::DtmfSent(info) = ev.payload {
            assert!(matches!(
                info.status,
                Err(crate::api::m20_dtmfsent_twophase::SentDtmfError::Timeout)
            ));
            assert_eq!(info.digit, '5');
        } else {
            panic!("expected DtmfSent, got {:?}", ev.payload);
        }
    }

    #[tokio::test]
    // @verifies C069
    // [::TICKET::] P11-6: handle_send_dtmf resolves the owning account_id from the call table
    async fn handle_send_dtmf_resolves_account_id_from_call_table() {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut backend = MockBackend::new();
        let call_id = CallId::from_u64(1).unwrap();
        let account_id = AccountId::from_u64(5).unwrap();
        let mut client_state = ClientState::default();
        client_state.calls.insert(
            call_id,
            CallEntry {
                id: 1,
                native_id: 1,
                account_id,
                state: "Active".into(),
                media: "none".into(),
            },
        );
        let client_event_buses: ClientEventBuses = std::collections::HashMap::new();
        let mut ctx = SendDtmfContext {
            backend: &mut backend,
            client_state: &client_state,
            client_event_buses: &client_event_buses,
            default_event_bus: &bus,
            sent_timeout_ms: crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS,
        };

        let result = handle_send_dtmf(
            &mut ctx,
            1,
            crate::config::account_config_spec::DtmfMethod::Rfc2833,
            "5",
        );
        assert!(result.is_ok());

        tokio::time::advance(std::time::Duration::from_millis(500)).await;
        let ev = rx.recv().await.unwrap();
        assert_eq!(
            ev.meta.account_id,
            Some(account_id),
            "the owning account must be resolved from client_state.calls"
        );
        assert_eq!(ev.meta.call_id, Some(call_id));
    }

    #[tokio::test]
    // @verifies C030
    // [::TICKET::] P11-6: handle_send_dtmf propagates backend error and spawns no timer
    async fn handle_send_dtmf_returns_err_without_timer_on_backend_err() {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut backend = MockBackend::new();
        backend.send_dtmf_result = Some(Err(crate::runtime::command::ReactorError::BackendError(
            "send failed".into(),
        )));
        let client_state = ClientState::default();
        let client_event_buses: ClientEventBuses = std::collections::HashMap::new();

        let mut ctx = SendDtmfContext {
            backend: &mut backend,
            client_state: &client_state,
            client_event_buses: &client_event_buses,
            default_event_bus: &bus,
            sent_timeout_ms: crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS,
        };
        let result = handle_send_dtmf(
            &mut ctx,
            1,
            crate::config::account_config_spec::DtmfMethod::Rfc2833,
            "5",
        );
        assert!(result.is_err(), "backend error must propagate");

        tokio::time::advance(std::time::Duration::from_millis(500)).await;
        assert!(
            matches!(
                rx.try_recv(),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
            ),
            "a failed backend.send_dtmf must never spawn a DtmfSent Timeout"
        );
    }

    #[tokio::test]
    // @verifies C012
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn reactor_add_account_replies_with_account_id() -> Result<(), Box<dyn std::error::Error>>
    {
        let (handle, join) = spawn_reactor();
        let id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        assert_eq!(id, 1, "MockBackend assigns the first account id 1");
        let state = handle.query_state().await?;
        assert_eq!(
            state.accounts.len(),
            1,
            "ClientState must reflect the added account"
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    // ── P12-1: MakeCall dispatch ───────────────────────────────────

    /// Shared test request for the MakeCall tests.
    // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
    fn test_call_request() -> crate::api::call_types::OutgoingCallRequest {
        crate::api::call_types::OutgoingCallRequest {
            target_uri: "sip:bob@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::api::call_types::CallMediaPreferences::default(),
            auto_answer_refer: false,
        }
    }

    #[test]
    // @verifies C070, C046
    // [::TICKET::] P12-1: handle_make_call delegates to the backend, registers the
    // returned CallEntry in the authoritative ClientState, and returns the CallId.
// [::TICKET::] P12-1, P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P12-8) --for-spec --no-implementation-order`.
    fn handle_make_call_registers_entry_and_returns_id() {
        let mut backend = MockBackend::new();
        let mut client_state = ClientState::default();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut empty_directions(),
        };
        let id = handle_make_call(&mut backend, &mut call_state, 1, &test_call_request())
            .unwrap_or_else(|error| panic!("make_call must succeed: {error}"));
        assert_eq!(id, 1, "MockBackend assigns the first call id 1");
        let entry = client_state
            .calls
            .get(&test_call_id(1))
            .unwrap_or_else(|| panic!("CallEntry must be registered under the returned CallId"));
        assert_eq!(entry.id, 1);
        assert_eq!(entry.account_id, test_account(1));
        assert_eq!(entry.state, "Calling");
    }

    #[test]
    // @verifies C070
    // [::TICKET::] P12-1: a failing backend.make_call must propagate Err and
    // register no CallEntry — never a fabricated id.
// [::TICKET::] P12-1, P12-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P12-8) --for-spec --no-implementation-order`.
    fn handle_make_call_error_registers_nothing() {
        let mut backend = MockBackend::new();
        backend.make_call_result = Some(Err(ReactorError::BackendError("invite rejected".into())));
        let mut client_state = ClientState::default();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut empty_directions(),
        };
        let result = handle_make_call(&mut backend, &mut call_state, 1, &test_call_request());
        assert!(
            matches!(result, Err(ReactorError::BackendError(_))),
            "backend error must propagate"
        );
        assert!(
            client_state.calls.is_empty(),
            "no CallEntry may be registered on a failed MakeCall"
        );
    }

    #[tokio::test]
    // @verifies C070, C046, C027
    // [::TICKET::] P12-1: the reactor round-trip — submit_make_call returns the
    // assigned CallId and the authoritative ClientState reflects the call.
    async fn reactor_make_call_registers_entry_and_replies_id(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let account_id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        let call_id = handle
            .submit_make_call(account_id, test_call_request())
            .await?;
        assert_eq!(call_id, 1, "MockBackend assigns the first call id 1");
        let state = handle.query_state().await?;
        assert_eq!(state.calls.len(), 1, "ClientState must reflect the call");
        assert!(
            state.calls.contains_key(&test_call_id(call_id)),
            "the returned CallId must be a key in client_state.calls"
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    #[tokio::test]
    // @verifies C021
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn reactor_remove_account_removes_from_client_state(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(crate::runtime::command::RuntimeCommand::RemoveAccount {
                account_id: id,
                reply: Reply::new(_tx),
            })
            .await?;
        let state = handle.query_state().await?;
        assert!(
            state.accounts.is_empty(),
            "RemoveAccount must remove the entry from the authoritative ClientState"
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    #[tokio::test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn reactor_update_account_updates_client_state_config(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        let mut new_config = crate::config::account_config_spec::AccountConfig {
            username: "bob".into(),
            domain: "pbx.example.com".into(),
            password: crate::security::SecretString::new("pass123"),
            ..Default::default()
        };
        new_config.registrar_uri = Some("sip:pbx.example.com".into());
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(crate::runtime::command::RuntimeCommand::UpdateAccount {
                account_id: id,
                config: new_config.clone(),
                reply: Reply::new(_tx),
            })
            .await?;
        let state = handle.query_state().await?;
        let entry = state
            .accounts
            .get(&test_account(id))
            .ok_or("account must exist")?;
        assert_eq!(entry.config.username, "bob");
        assert_eq!(
            entry.config.registrar_uri,
            Some("sip:pbx.example.com".into())
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    #[tokio::test]
    // @verifies C052
    // Error path: an UpdateAccount for an account absent from ClientState must
    // reply Err (never silently Ok) — the error is surfaced via submit()'s
    // awaited reply channel, which the update_config facade maps to SipError.
    // [::TICKET::] P11-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-7 --for-spec --no-implementation-order`.
    async fn reactor_update_account_missing_account_replies_err(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: crate::security::SecretString::new("pass123"),
            ..Default::default()
        };
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        let result = handle
            .submit(crate::runtime::command::RuntimeCommand::UpdateAccount {
                account_id: 999, // not registered in ClientState
                config,
                reply: Reply::new(_tx),
            })
            .await;
        assert!(
            result.is_err(),
            "UpdateAccount for an account absent from ClientState must reply Err"
        );
        assert!(
            matches!(result.unwrap_err(), ReactorError::NotInitialized(_)),
            "the reply must be a ReactorError describing the missing account"
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    #[tokio::test]
    // @verifies C016
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn reactor_create_transport_records_transport_runtime_state(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(crate::runtime::command::RuntimeCommand::CreateTransport {
                config: crate::config::transport_ice_spec::TransportConfig::udp(5070),
                reply: Reply::new(_tx),
            })
            .await?;
        let state = handle.query_state().await?;
        assert_eq!(state.transports.len(), 1, "one transport must be recorded");
        assert_eq!(state.transports[0].port, 5070);
        assert_eq!(state.transports[0].transport_type, "udp");
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    // ── P12-7: reactor-loop NativeEvent ingestion round-trip ───────────

    #[tokio::test]
    // @verifies C039, C046
    // [::TICKET::] P12-7: a NativeEvent injected through the handle's ingestion
    // receiver reaches process_native_event on the reactor thread and is published
    // on the reactor-owned default_event_bus (O-001 production flow).
    async fn reactor_enqueued_registration_state_changed_publishes(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        // Register an account so MockBackend::get_account_info(1) yields the
        // Ok(200) success shape (P10-1 registry-derived snapshot).
        let account_id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        let mut rx = handle.default_event_bus().subscribe_control();

        handle.enqueue_native_event(NativeEvent::RegistrationStateChanged {
            acc_id: account_id as u32,
        })?;

        let ev = rx.recv().await?;
        assert!(
            matches!(ev.payload, SipEventPayload::RegistrationSucceeded(_)),
            "expected RegistrationSucceeded, got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.account_id, Some(test_account(1)));
        shutdown_reactor(handle, join).await;
        Ok(())
    }
}

// [::TICKET::] P0-2: CoreReactor — dedicated thread for serialized PJSUA command execution

use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::{self, JoinHandle};

use crate::config::ClientConfig;
use crate::runtime::audio_worker::{AudioMixer, AudioWorkerTask};
use crate::runtime::backend::SipBackend;
use crate::runtime::backend_selection::create_backend;
use crate::runtime::command::{send_reply, DispatchCommand, ReactorError};
use crate::runtime::handle::{self, RuntimeHandle};
use crate::runtime::state::{AccountEntry, CallEntry, ClientState};

use crate::api::event_model_payload_bus::{
    AccountId, CallId, ConnectedCallInfo, EventMeta, SipEvent, SipEventPayload,
};
use crate::api::eventbus_receiver::EventBus;
use crate::audio::media_path_arch::ChannelSelector;
use crate::state::m20_callstate_mapping::{convert_call_state_with_previous, CallDirection};
use crate::state::m20_native_event_conv::{convert_native_event_to_payload, NativeEvent};
use crate::state::registr_wiring::{
    apply_registration_command_state, process_registration_state_changed,
};
use crate::state::shutdown_specification::ShutdownSpec;
use crate::state::shutdown_wiring::{
    client_shutdown_event, execute_shutdown_sequence, gate_command, reject_command,
    shutdown_phase_timeout, ShutdownGate,
};

/// Name of the reactor OS thread. Used for diagnostics and by the FFI
/// thread-lifecycle observer (P8-21) to correlate thread ids with the reactor.
const REACTOR_THREAD_NAME: &str = "siprs-reactor";

/// Default frame cadence for per-call audio workers (§62.6).
///
/// 20 ms matches the mixer frame model (160 samples at 8 kHz) and the
/// `AudioWorkerTask` default pacing used by the existing worker tests.
const DEFAULT_AUDIO_FRAME_DURATION: std::time::Duration = std::time::Duration::from_millis(20);

/// Configuration passed to `CoreReactor::spawn()`.
///
/// `config` resolves to the RFC §10 `ClientConfig` re-exported from
/// `src/config.rs` (P15-2 ConfigUnification).
#[derive(Debug, Clone)]
pub struct BootConfig {
    /// The client configuration that drives PJSUA initialization.
    pub config: ClientConfig,
    /// DtmfSent fallback timeout in milliseconds (O-002, P7-2).
    ///
    /// The RFC §10 `ClientConfig` carries no DTMF field, so the reactor reads
    /// this timeout from a dedicated boot parameter sourced at the
    /// `SipClient::new` boundary.
    pub dtmf_sent_timeout_ms: u64,
    /// The single EventBus owned by `SipClient` (§62.3 / N0072).
    ///
    /// The reactor publishes every converted `SipEvent` directly to this bus —
    /// there is no reactor-owned default bus and no per-account client bus map.
    /// `SipClient::new` creates the bus (raw_sip capacity per
    /// `RawSipEventConfig::enabled`) and passes a clone here.
    pub event_bus: EventBus,
    /// The shared `subscribe_audio` tap producer registry (§62.6).
    ///
    /// `SipClient` owns the registry and passes a clone here so the backend's
    /// `push_media_frame` can drive the subscribed taps from the media callback.
    pub audio_taps: crate::runtime::backend::AudioTapRegistry,
}

// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
impl Default for BootConfig {
// [::TICKET::] P15-2, P15-4, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-2|P15-4|P15-7) --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            config: ClientConfig::default(),
            dtmf_sent_timeout_ms: crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS,
            event_bus: EventBus::new(
                crate::api::eventbus_receiver::DEFAULT_EVENT_BUS_CAPACITY,
                None,
            ),
            audio_taps: Arc::new(Mutex::new(HashMap::new())),
        }
    }
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

/// Result of `CoreReactor::spawn()`: the runtime handle plus the reactor thread
/// join handle, or a boxed spawn error.
// [::TICKET::] P15-4, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-4|P15-7) --for-spec --no-implementation-order`.
type SpawnResult =
    Result<(RuntimeHandle, Arc<JoinHandle<()>>), Box<dyn std::error::Error + Send + Sync>>;

// [::TICKET::] P0-2, P0-5, P0-6, P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P3-2) --for-spec --no-implementation-order`.
// [::TICKET::] P6-1, P7-2, P8-1, P10-3, P10-4, P11-3, P11-6, P11-11, P12-6, P12-1, P12-7, P12-8, P15-2, P15-3, P15-4, P15-5, P15-6, P15-7, P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P6-1|P7-2|P8-1|P10-3|P10-4|P11-3|P11-6|P11-11|P12-6|P12-1|P12-7|P12-8|P15-2|P15-3|P15-4|P15-5|P15-6|P15-7|P15-8) --for-spec --no-implementation-order`.
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
    pub fn spawn(boot_config: BootConfig) -> SpawnResult {
        let (tx, mut rx) = handle::create_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let terminated_clone = terminated.clone();

        // [::TICKET::] P15-3: §62.2 — the backend is selected by feature set:
        // PjsuaBackend (pjsua-native), TestBackend (test builds), or an explicit
        // unsupported error otherwise. TestBackend no longer exists in production.
        let mut backend = create_backend(&boot_config.config, boot_config.audio_taps.clone())?;
        // [::TICKET::] P8-1, P15-7: O-003 — the reactor owns per-call AudioMixers
        // keyed by call_id (§62.6). Audio lifecycle commands (AddAudioSource /
        // RemoveAudioSource / SetAudioSourceGain / MuteAudioSource) mutate the
        // per-call mixer on the reactor thread (single-writer rule).
        let audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> =
            Arc::new(RwLock::new(HashMap::new()));
        // [::TICKET::] P11-3, P15-7: O-001 — expose a clone of the reactor mixer
        // map to the handle so tests/observability can assert post-dispatch mixer
        // state without a round-trip command. The thread keeps its own Arc
        // (single-writer rule).
        let audio_mixers_for_handle = audio_mixers.clone();
        // [::TICKET::] P15-7: one global source-id counter shared by every
        // per-call mixer so a source_id is unique across calls (the lifecycle
        // commands address a source by id alone).
        let source_id_counter: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));

        // [::TICKET::] P15-4: §62.3 — the reactor publishes to the single EventBus
        // owned by SipClient. The thread closure takes ownership of the bus; the
        // handle needs its own clone, taken BEFORE the thread spawn (thread-first).
        let event_bus = boot_config.event_bus;
        let event_bus_for_handle = event_bus.clone();
        // [::TICKET::] P11-6: sent_timeout_ms drives the DtmfSent fallback timer (C030).
        // [::TICKET::] P15-2: the RFC §10 ClientConfig has no dtmf field; the timeout
        // is a dedicated BootConfig boot parameter (P7-2 O-002).
        let dtmf_sent_timeout_ms = boot_config.dtmf_sent_timeout_ms;
        // [::TICKET::] P15-8: §62.7 — the reactor owns one ShutdownSpec whose
        // per-phase timeout is sourced from TimeoutConfig::shutdown_timeout
        // (default 15s). is_shutdown_started() drives the M20 command gate and
        // execute_sequence runs the §32 ordered shutdown.
        let shutdown_spec = ShutdownSpec::new(shutdown_phase_timeout(&boot_config.config));

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
                // [::TICKET::] P15-7: per-call audio workers. One AudioWorkerTask
                // drives each per-call AudioMixer's process_frame loop (§62.6);
                // owned by the reactor thread and shut down on exit.
                let mut audio_workers: HashMap<u64, AudioWorkerTask> = HashMap::new();

                // [::TICKET::] P11-6: `enter()` installs the reactor-owned timer
                // runtime as the current context on this std thread so
                // `spawn_dtmf_sent_timeout` (which uses `tokio::spawn`) works
                // without restructuring the loop.
                let _timer_enter = timer_runtime.enter();
                // §62.7: once the Shutdown arm has completed the §32 sequence, the
                // reactor drains the channel — every queued command is rejected
                // and the thread exits when the channel is empty or closed.
                let mut draining = false;

                loop {
                    if draining {
                        match rx.try_recv() {
                            Ok(command) => reject_command(command),
                            Err(_) => break,
                        }
                        continue;
                    }

                    match rx.blocking_recv() {
                        Some(command) => {
                            // M20 shutdown gate (N0044): while shutting down only
                            // Shutdown and GetAccountInfo are permitted; every other
                            // command is rejected with an error reply so its caller
                            // never hangs. Rejected commands are consumed; permitted
                            // commands are rebound for the dispatch match below.
                            let command = match gate_command(
                                command,
                                shutdown_spec.is_shutdown_started(),
                            ) {
                                ShutdownGate::Rejected { command } => {
                                    tracing::warn!(
                                        command = %command,
                                        "command dropped during shutdown"
                                    );
                                    continue;
                                }
                                ShutdownGate::Permit(command) => command,
                            };
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
                                        event_bus: &event_bus,
                                        sent_timeout_ms: dtmf_sent_timeout_ms,
                                    };
                                    let result =
                                        handle_send_dtmf(&mut ctx, call_id, method, &digits);
                                    send_reply(reply, result);
                                }
                                DispatchCommand::AddAudioSource {
                                    call_id,
                                    source,
                                    channels,
                                    reply,
                                } => {
                                    // [::TICKET::] P8-1, P15-7: O-003 — the reactor owns
                                    // per-call AudioMixers; audio lifecycle commands
                                    // mutate them here on the reactor thread
                                    // (single-writer rule). §62.6: branch the source into
                                    // the IN / OUT / both media paths via ChannelSelector.
                                    let mixer =
                                        get_or_create_mixer(&audio_mixers, &source_id_counter, call_id);
                                    // Spawn the per-call worker the first time a mixer is
                                    // created so its process_frame loop drives the paths.
                                    if !audio_workers.contains_key(&call_id) {
                                        let worker = AudioWorkerTask::spawn(
                                            mixer.clone(),
                                            call_id,
                                            DEFAULT_AUDIO_FRAME_DURATION,
                                        );
                                        audio_workers.insert(call_id, worker);
                                    }
                                    let source = source.into_inner();
                                    let source_id = match channels {
                                        ChannelSelector::In => mixer.add_in_source(source),
                                        ChannelSelector::Out => mixer.add_out_source(source),
                                        ChannelSelector::Both => {
                                            // AudioMixer guards sources with a tokio Mutex
                                            // (async next_chunk), so the shared wrapper must
                                            // be tokio::sync::Mutex too.
                                            let shared =
                                                Arc::new(tokio::sync::Mutex::new(source));
                                            let in_id =
                                                mixer.add_in_source_shared(shared.clone());
                                            mixer.add_out_source_shared(shared);
                                            in_id
                                        }
                                    };
                                    send_reply(reply, Ok(source_id));
                                }
                                DispatchCommand::RemoveAudioSource {
                                    source_id,
                                    reply,
                                } => {
                                    let result = match mixer_owning_source(&audio_mixers, source_id)
                                    {
                                        Some(mixer) => mixer.remove_source(source_id),
                                        None => Err(ReactorError::BackendError(format!(
                                            "source {source_id} not found"
                                        ))),
                                    };
                                    send_reply(reply, result);
                                }
                                DispatchCommand::SetAudioSourceGain {
                                    source_id,
                                    gain,
                                    reply,
                                } => {
                                    let result = match mixer_owning_source(&audio_mixers, source_id)
                                    {
                                        Some(mixer) => mixer.set_gain(source_id, gain),
                                        None => Err(ReactorError::BackendError(format!(
                                            "source {source_id} not found"
                                        ))),
                                    };
                                    send_reply(reply, result);
                                }
                                DispatchCommand::MuteAudioSource {
                                    source_id,
                                    muted,
                                    reply,
                                } => {
                                    let result = match mixer_owning_source(&audio_mixers, source_id)
                                    {
                                        Some(mixer) => mixer.mute(source_id, muted),
                                        None => Err(ReactorError::BackendError(format!(
                                            "source {source_id} not found"
                                        ))),
                                    };
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
                                DispatchCommand::Answer {
                                    call_id,
                                    code,
                                    reply,
                                } => {
                                    // [::TICKET::] P15-6: answer the call, update
                                    // CallEntry.state, and publish CallConnected /
                                    // decline events (§19.1). The reply is sent exactly
                                    // once on every outcome.
                                    let mut call_state = CallStateTables {
                                        calls: &mut client_state.calls,
                                        call_directions: &mut call_directions,
                                    };
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            handle_answer(
                                                &mut *backend,
                                                &event_bus,
                                                &mut call_state,
                                                call_id,
                                                code,
                                            )
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor answer panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(
                                                    format!("reactor panic: {msg}")
                                                )
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::Hangup {
                                    call_id,
                                    reason,
                                    reply,
                                } => {
                                    // [::TICKET::] P15-6: hang up the call, mark it
                                    // disconnected in ClientState, and publish
                                    // CallDisconnected. The reply is sent exactly once.
                                    let mut call_state = CallStateTables {
                                        calls: &mut client_state.calls,
                                        call_directions: &mut call_directions,
                                    };
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            handle_hangup(
                                                &mut *backend,
                                                &event_bus,
                                                &mut call_state,
                                                call_id,
                                                reason,
                                            )
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor hangup panicked");
                                            let _ = reply.send(Err(
                                                ReactorError::BackendError(
                                                    format!("reactor panic: {msg}")
                                                )
                                            ));
                                            break;
                                        }
                                    }
                                }
                                DispatchCommand::Transfer {
                                    call_id,
                                    target,
                                    reply,
                                } => {
                                    // [::TICKET::] P15-6: blind-transfer the call and
                                    // mark it Transferring in ClientState. The reply is
                                    // sent exactly once.
                                    let mut call_state = CallStateTables {
                                        calls: &mut client_state.calls,
                                        call_directions: &mut call_directions,
                                    };
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            handle_transfer(
                                                &mut *backend,
                                                &mut call_state,
                                                call_id,
                                                &target,
                                            )
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor transfer panicked");
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
                                    register_on_start,
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
                                            backend.update_account(native_id, &config)?;
                                            // §62.4: consume the register_on_start delta —
                                            // re-issue registration/unregistration after the
                                            // config update.
                                            if let Some(enabled) = register_on_start {
                                                backend.set_registration(native_id, enabled)?;
                                                apply_registration_command_state(
                                                    &mut client_state,
                                                    aid,
                                                    enabled,
                                                );
                                            }
                                            Ok(())
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
                                DispatchCommand::SetRegistration {
                                    account_id,
                                    enabled,
                                    reply,
                                } => {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            let aid = AccountId::from_u64(account_id).map_err(
                                                |_| {
                                                    ReactorError::NotInitialized(
                                                        "invalid account id".into(),
                                                    )
                                                },
                                            )?;
                                            let native_id = client_state
                                                .accounts
                                                .get(&aid)
                                                .ok_or_else(|| {
                                                    ReactorError::NotInitialized(
                                                        "account not found".into(),
                                                    )
                                                })?
                                                .native_id;
                                            backend.set_registration(native_id, enabled)?;
                                            // §17.1 command edge: advance ClientState to
                                            // Registering/Unregistering alongside the backend.
                                            apply_registration_command_state(
                                                &mut client_state,
                                                aid,
                                                enabled,
                                            );
                                            Ok(())
                                        }),
                                    );
                                    match result {
                                        Ok(Ok(())) => {
                                            let _ = reply.send(Ok(()));
                                        }
                                        Ok(Err(e)) => {
                                            let _ = reply.send(Err(e));
                                        }
                                        Err(panic_payload) => {
                                            terminated.store(true, Ordering::Release);
                                            let msg = panic_message(&panic_payload);
                                            tracing::error!(panic_msg = %msg, "reactor set_registration panicked");
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
                                    // to the single EventBus. Backend errors surface as
                                    // SipEventPayload::Error — never crash the loop.
                                    let mut call_state = CallStateTables {
                                        calls: &mut client_state.calls,
                                        call_directions: &mut call_directions,
                                    };
                                    process_native_event(
                                        &*backend,
                                        &event_bus,
                                        event,
                                        &mut call_state,
                                        &mut client_state.accounts,
                                    );
                                }
                                DispatchCommand::Shutdown { reply } => {
                                    // §62.7 / C088: run the full §32 sequence
                                    // (BYE/CANCEL → unregister → audio drain →
                                    // pjsua_destroy) with the configured per-phase
                                    // timeout, blocking the reactor thread on the
                                    // already-entered timer runtime (§62.6 pattern).
                                    let sequence_result = tokio::runtime::Handle::current()
                                        .block_on(execute_shutdown_sequence(
                                            &mut *backend,
                                            &client_state,
                                            &shutdown_spec,
                                        ));
                                    if let Err(err) = &sequence_result {
                                        tracing::error!("shutdown sequence failed: {err}");
                                    }
                                    // §62.3 / C089: publish ClientShutdown on the
                                    // single client-owned bus before replying.
                                    event_bus.publish(client_shutdown_event());
                                    // Stop every per-call audio worker before exiting so no
                                    // blocking-pool task outlives the reactor (§62.6).
                                    shutdown_audio_workers(&mut audio_workers);
                                    // C044 postcondition: publish the terminated flag before
                                    // replying, so shutdown() callers observe is_terminated() == true
                                    // the moment shutdown() returns Ok (oneshot send orders the store).
                                    terminated.store(true, Ordering::Release);
                                    send_reply(
                                        reply,
                                        sequence_result.map_err(|e| {
                                            ReactorError::BackendError(e.to_string())
                                        }),
                                    );
                                    // §62.7 / C090: enter drain mode — subsequent queued
                                    // commands are rejected with an error reply.
                                    draining = true;
                                }
                            }
                        }
                        None => {
                            // All senders dropped — channel closed, exit. Stop the
                            // per-call workers so they do not outlive the reactor.
                            shutdown_audio_workers(&mut audio_workers);
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
            audio_mixers_for_handle,
            event_bus_for_handle,
        );

        Ok((handle, reactor_join))
    }
}

/// Get (or create) the per-call `AudioMixer` for `call_id` (§62.6).
///
/// The first `AddAudioSource` for a call creates its mixer with the shared
/// global source-id counter, so ids stay unique across calls. The reactor is
/// the single writer of the map (single-writer rule); callers hold a read
/// guard only while cloning the matching `Arc`.
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
fn get_or_create_mixer(
    audio_mixers: &Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>,
    source_id_counter: &Arc<AtomicU64>,
    call_id: u64,
) -> Arc<AudioMixer> {
    if let Some(mixer) = audio_mixers
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&call_id)
    {
        return mixer.clone();
    }
    let mixer = Arc::new(AudioMixer::with_shared_id_source(source_id_counter.clone()));
    audio_mixers
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(call_id, mixer.clone());
    mixer
}

/// Find the per-call mixer that owns `source_id`, if any.
///
/// The lifecycle commands address a source by id alone, so the reactor scans
/// the per-call mixers to locate the owner (ids are globally unique).
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
fn mixer_owning_source(
    audio_mixers: &Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>,
    source_id: u64,
) -> Option<Arc<AudioMixer>> {
    audio_mixers
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .values()
        .find(|mixer| mixer.has_source(source_id))
        .cloned()
}

/// Gracefully stop every per-call audio worker.
///
/// Called on reactor shutdown / channel-close so no blocking-pool task
/// outlives the reactor (§62.6). The reactor thread has the timer runtime
/// entered, so `Handle::current().block_on` drives each async shutdown.
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
fn shutdown_audio_workers(workers: &mut HashMap<u64, AudioWorkerTask>) {
    for (call_id, mut worker) in workers.drain() {
        tracing::info!(call_id, "shutting down audio worker");
        tokio::runtime::Handle::current().block_on(worker.shutdown());
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

/// Publish a `SipEvent` to the single client-owned `EventBus` (§62.3 / N0072).
///
/// Replaces the pre-P15-4 account_id-based dispatch (per-account client buses +
/// reactor default bus) with a direct publish to the one bus owned by
/// `SipClient`. Subscribers filter on the receiving side:
/// `subscribe_account` via `AccountEventReceiver`, `subscribe_raw_sip` via the
/// isolated raw_sip channel.
///
/// This is the production publish path: the Reactor calls it whenever a
/// NativeEvent has been converted to a `SipEvent` (O-003).
// [::TICKET::] P15-4: O-003 — production single-bus EventBus dispatch
pub(crate) fn dispatch_event(event_bus: &EventBus, event: SipEvent) {
    event_bus.publish(event);
}

/// Convert a `NativeEvent` to a `SipEvent` and publish it via `dispatch_event` (N0021).
///
/// `RegistrationStateChanged` is special (§62.4): it delegates to
/// `registr_wiring::process_registration_state_changed`, which queries the
/// backend via `get_account_info()`, drives the §17 state machine, updates
/// `ClientState`, and produces `SipEventPayload::RegistrationStateChanged`
/// (or `Error` on backend failure).
///
/// Other P0 events flow through `convert_native_event_to_payload`; P1/P2 events
/// convert to `None` and are silently not published (documented rationale).
///
/// `calls` is the reactor's call-state table (`ClientState.calls`). Call-scoped
/// events carry no `acc_id`, so the owning account is resolved from
/// `calls[call_id].account_id` before conversion — this is what lets a
/// `CONFIRMED` call publish a `CallConnected` payload with the real account.
// [::TICKET::] P15-4: O-001 — production NativeEvent → SipEvent publication flow
pub(crate) fn process_native_event(
    backend: &dyn SipBackend,
    event_bus: &EventBus,
    event: NativeEvent,
    call_state: &mut CallStateTables<'_>,
    accounts: &mut BTreeMap<AccountId, AccountEntry>,
) {
    match event {
        NativeEvent::RegistrationStateChanged { acc_id } => {
            if let Some(sip_event) = process_registration_state_changed(backend, acc_id, accounts) {
                dispatch_event(event_bus, sip_event);
            }
        }
        other_event => {
            // Record the call origin before conversion: an inbound INVITE implies
            // CallDirection::Incoming (C039 provenance — never read from payload).
            if let NativeEvent::IncomingCall { call_id, .. } = &other_event {
                if let Ok(cid) = CallId::from_u64(*call_id as u64) {
                    call_state
                        .call_directions
                        .insert(cid, CallDirection::Incoming);
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
                dispatch_event(event_bus, sip_event);
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
    event_bus: &'a EventBus,
    sent_timeout_ms: u64,
}

/// Handle a `MakeCall` command on the reactor thread.
///
/// Delegates to the backend, registers the returned `CallEntry` in the reactor's
/// authoritative `ClientState.calls` (C046), and returns the assigned logical
/// CallId. Extracted as a helper so the error path is unit-testable with a
/// failing TestBackend (mirrors `handle_send_dtmf`).
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
        call_state
            .call_directions
            .insert(call_id, CallDirection::Outgoing);
    }
    Ok(entry_id)
}

/// Handle a `RuntimeCommand::Answer` on the reactor thread (§19.1 / N0027).
///
/// Reads as prose: answer via the backend; on success record the resulting call
/// state in the authoritative `ClientState.calls`, publish `CallConnected` for a
/// `200` accept or `CallDisconnected` for a `486`/`603` decline (the reject path),
/// and leave provisional answers (`180`/`183`) without a terminal event; on
/// backend error propagate without mutating state.
pub(crate) fn handle_answer(
    backend: &mut dyn SipBackend,
    event_bus: &EventBus,
    call_state: &mut CallStateTables<'_>,
    call_id: u64,
    code: u16,
) -> Result<(), ReactorError> {
    let call_id_typed = CallId::from_u64(call_id)
        .map_err(|_| ReactorError::BackendError("invalid call id 0".into()))?;
    backend.answer_call(call_id as i32, code)?;
    let account_id = call_state.calls.get(&call_id_typed).map(|e| e.account_id);
    if let Some(entry) = call_state.calls.get_mut(&call_id_typed) {
        entry.state = crate::api::call_api_expansion::answer_state_string(code).to_string();
    }
    let payload = match (code, account_id) {
        (200, Some(account_id)) => Some(SipEventPayload::CallConnected(ConnectedCallInfo {
            call_id: call_id_typed,
            account_id,
            remote_uri: String::new(),
        })),
        (486 | 603, _) => Some(SipEventPayload::CallDisconnected),
        _ => None,
    };
    if let Some(payload) = payload {
        dispatch_event(
            event_bus,
            SipEvent {
                meta: EventMeta::new(0, account_id, Some(call_id_typed)),
                payload,
            },
        );
    }
    Ok(())
}

/// Handle a `RuntimeCommand::Hangup` on the reactor thread.
///
/// Reads as prose: hang up via the backend; on success mark the call
/// `Disconnected` in the authoritative `ClientState.calls` and publish
/// `CallDisconnected`; on backend error propagate. The caller-supplied reason is
/// logged for observability — the backend `hangup` API takes only the native id.
pub(crate) fn handle_hangup(
    backend: &mut dyn SipBackend,
    event_bus: &EventBus,
    call_state: &mut CallStateTables<'_>,
    call_id: u64,
    reason: crate::call::HangupReason,
) -> Result<(), ReactorError> {
    let call_id_typed = CallId::from_u64(call_id)
        .map_err(|_| ReactorError::BackendError("invalid call id 0".into()))?;
    backend.hangup(call_id as i32)?;
    tracing::info!(%call_id_typed, ?reason, "call hung up");
    let account_id = call_state.calls.get(&call_id_typed).map(|e| e.account_id);
    if let Some(entry) = call_state.calls.get_mut(&call_id_typed) {
        entry.state = "Disconnected".to_string();
    }
    dispatch_event(
        event_bus,
        SipEvent {
            meta: EventMeta::new(0, account_id, Some(call_id_typed)),
            payload: SipEventPayload::CallDisconnected,
        },
    );
    Ok(())
}

/// Handle a `RuntimeCommand::Transfer` on the reactor thread.
///
/// Reads as prose: blind-transfer via the backend; on success record the target
/// and mark the call `Transferring` in the authoritative `ClientState.calls`;
/// on backend error propagate.
pub(crate) fn handle_transfer(
    backend: &mut dyn SipBackend,
    call_state: &mut CallStateTables<'_>,
    call_id: u64,
    target: &str,
) -> Result<(), ReactorError> {
    let call_id_typed = CallId::from_u64(call_id)
        .map_err(|_| ReactorError::BackendError("invalid call id 0".into()))?;
    backend.transfer_call(call_id as i32, target)?;
    if let Some(entry) = call_state.calls.get_mut(&call_id_typed) {
        entry.state = "Transferring".to_string();
    }
    Ok(())
}

/// Handle a `RuntimeCommand::SendDtmf` on the reactor thread.
///
/// Reads as prose: send via the backend; on success resolve the owning account,
/// convert the method, and spawn one `spawn_dtmf_sent_timeout` per digit that
/// publishes `DtmfSent { Err(Timeout) }` to the single client-owned bus; on
/// backend error propagate and spawn nothing (two-phase C030 preserved).
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
    let target_bus = ctx.event_bus.clone();
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
    use crate::api::event_model_payload_bus::SipEventPayload;
    use crate::runtime::backend::TestBackend;
    use crate::runtime::command::Reply;
    use crate::runtime::state::{AccountEntry, CallEntry};
    use crate::state::m20_callstate_mapping::pjsip_inv_state;
    use crate::state::m20_registr_cmd_pat::AccountInfoSnapshot;
    use crate::state::registr_state_machine::RegistrationState;
    use std::collections::BTreeMap;

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

    // ── P15-4: single-bus dispatch_event ───────────────────────────────

    /// @verifies C039, C084
    #[test]
    // [::TICKET::] P15-4: O-003 — dispatch_event publishes directly to the single bus
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn dispatch_event_publishes_to_single_bus() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        dispatch_event(&bus, make_disconnect_event(Some(test_account(1))));

        let ev = rx
            .try_recv()
            .expect("single bus must deliver the account-scoped event");
        assert_eq!(ev.meta.account_id, Some(test_account(1)));
    }

    /// @verifies C039
    #[test]
    // [::TICKET::] P15-4: account_id=None lifecycle events also flow on the single bus
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn dispatch_event_lifecycle_event_flows_to_single_bus() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        let mut event = make_disconnect_event(None);
        event.meta.account_id = None;
        dispatch_event(&bus, event);

        let ev = rx
            .try_recv()
            .expect("lifecycle event must be delivered on the single bus");
        assert_eq!(ev.meta.account_id, None);
    }

    // ── O-001: production process_native_event registration flow ───────

    /// @verifies C024, C073
    #[tokio::test]
    // [::TICKET::] P15-5: §62.4 — a status 200 native event drives the state machine
    // from Registering to Registered and publishes RegistrationStateChanged(Registered).
    async fn process_native_event_registration_200_publishes_registration_state_changed_registered(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account(&crate::config::account_config_spec::AccountConfig::default())?;
        backend.mark_registered(1); // get_account_info -> status 200
        let bus = EventBus::new(16, None);
        let mut calls = BTreeMap::new();
        let mut accounts = account_with_registration(1, RegistrationState::Registering);
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
            &mut accounts,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        assert!(
            matches!(
                ev.payload,
                SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
            ),
            "expected RegistrationStateChanged(Registered), got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.account_id, Some(test_account(1)));
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Registered
        );
        Ok(())
    }

    /// @verifies C024
    #[tokio::test]
    // [::TICKET::] P15-5: §62.4 — get_account_info Err publishes SipEventPayload::Error
    // and leaves ClientState unchanged (no silent drop, no state corruption).
    async fn process_native_event_registration_err_publishes_error() {
        let mut backend = TestBackend::new();
        backend.get_account_info_result =
            Some(Err(ReactorError::BackendError("mock backend down".into())));
        let bus = EventBus::new(16, None);
        let mut calls = BTreeMap::new();
        let mut accounts = account_with_registration(1, RegistrationState::Registering);
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
            &mut accounts,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        assert!(
            matches!(ev.payload, SipEventPayload::Error(_)),
            "expected Error, got {:?}",
            ev.payload
        );
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Registering
        );
    }

    /// @verifies C024
    #[tokio::test]
    // [::TICKET::] P10-6: O-001 — non-200 Ok snapshot (403) publishes RegistrationFailed via the production flow
    // [::TICKET::] P10-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-6 --for-spec --no-implementation-order`.
    async fn process_native_event_registration_403_publishes_registration_state_changed_failed() {
        // C024/C085: a non-200 registration status drives Registering → Failed and
        // publishes RegistrationStateChanged(Failed) via the production path.
        let mut backend = TestBackend::new();
        backend.get_account_info_result = Some(Ok(AccountInfoSnapshot {
            acc_id: test_account(1),
            registration_status: 403,
            registration_expires: None,
            online_status: false,
            uri: "sip:alice@example.com".into(),
        }));
        let bus = EventBus::new(16, None);
        let mut calls = BTreeMap::new();
        let mut accounts = account_with_registration(1, RegistrationState::Registering);
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
            &mut accounts,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|error| panic!("expected event on bus: {error}"));
        assert!(
            matches!(
                ev.payload,
                SipEventPayload::RegistrationStateChanged(RegistrationState::Failed)
            ),
            "expected RegistrationStateChanged(Failed), got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.account_id, Some(test_account(1)));
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Failed
        );
    }

    /// @verifies C022
    #[tokio::test]
    // [::TICKET::] P7-2: O-001 — non-registration P0 events convert and publish through dispatch_event
    async fn process_native_event_call_state_changed_publishes() {
        let backend = TestBackend::new();
        let bus = EventBus::new(16, None);
        let mut calls = confirmed_calls();
        let mut rx = bus.subscribe_control();

        let mut accounts = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 10,
                state: pjsip_inv_state::CONFIRMED,
            },
            &mut call_state,
            &mut accounts,
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
        let backend = TestBackend::new();
        let bus = EventBus::new(16, None);
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

        let mut accounts = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 10,
                state: pjsip_inv_state::CONFIRMED,
            },
            &mut call_state,
            &mut accounts,
        );
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 11,
                state: pjsip_inv_state::CONFIRMED,
            },
            &mut call_state,
            &mut accounts,
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
        let backend = TestBackend::new();
        let bus = EventBus::new(16, None);
        let mut calls = BTreeMap::new();
        let mut accounts = BTreeMap::new();
        let mut rx = bus.subscribe_control();

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::TransportStateChanged {
                transport_id: 1,
                state: 0,
            },
            &mut call_state,
            &mut accounts,
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
        let backend = TestBackend::new();
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

        let mut accounts = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 7,
                state: pjsip_inv_state::CONNECTING,
            },
            &mut call_state,
            &mut accounts,
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
        let backend = TestBackend::new();
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

        let mut accounts = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 7,
                state: pjsip_inv_state::CONNECTING,
            },
            &mut call_state,
            &mut accounts,
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
        let backend = TestBackend::new();
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

        let mut accounts = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::CallStateChanged {
                call_id: 7,
                state: pjsip_inv_state::CONNECTING,
            },
            &mut call_state,
            &mut accounts,
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
        let backend = TestBackend::new();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::new();
        let mut directions = empty_directions();

        let mut accounts = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut directions,
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::IncomingCall {
                acc_id: 42,
                call_id: 7,
            },
            &mut call_state,
            &mut accounts,
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
// [::TICKET::] P12-8, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-8|P15-3) --for-spec --no-implementation-order`.
    fn handle_make_call_records_outgoing_direction() {
        let mut backend = TestBackend::new();
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

    #[tokio::test]
    // @verifies C089
    // [::TICKET::] P15-8: §62.7 — the Shutdown arm runs the §32 sequence and
    // publishes ClientShutdown on the single client-owned bus before replying.
    async fn reactor_shutdown_publishes_client_shutdown() {
        let (handle, join) = spawn_reactor();
        let mut rx = handle.event_bus().subscribe_control();
        let (tx, rx_reply) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Shutdown {
            reply: Reply::new(tx),
        };
        handle.sender.send(cmd).ok();
        assert!(rx_reply.await.is_ok(), "shutdown must complete");
        let ev = tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
            .await
            .expect("ClientShutdown must be published within the bound")
            .expect("the bus must yield an event");
        assert!(
            matches!(ev.payload, SipEventPayload::ClientShutdown),
            "expected ClientShutdown, got {:?}",
            ev.payload
        );
        assert!(
            handle.is_terminated(),
            "reactor must be terminated after shutdown"
        );
        join_reactor(handle, join);
    }

    #[tokio::test]
    // @verifies C090
    // [::TICKET::] P15-8: §62.7 — commands queued behind Shutdown are rejected
    // via the M20 gate with an error reply, so the caller never hangs.
    async fn reactor_rejects_commands_queued_during_shutdown() {
        let (handle, join) = spawn_reactor();
        let (tx_shutdown, _rx_shutdown) = tokio::sync::oneshot::channel();
        handle
            .sender
            .send(DispatchCommand::Shutdown {
                reply: Reply::new(tx_shutdown),
            })
            .ok();
        let (tx_cmd, rx_cmd) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Execute {
            f: Box::new(|_: &mut dyn SipBackend| Ok(())),
            reply: Reply::new(tx_cmd),
        };
        handle.sender.send(cmd).ok();
        let reply = tokio::time::timeout(std::time::Duration::from_secs(1), rx_cmd)
            .await
            .expect("the gated command's reply must arrive within the bound")
            .expect("the oneshot must resolve");
        assert!(
            matches!(reply, Err(ReactorError::BackendError(msg)) if msg.contains("shutting down")),
            "the queued command must be rejected, not hang"
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

    // ── P15-4: single client-owned EventBus + SendDtmf two-phase wiring ──

    #[tokio::test]
    // @verifies C069
    // [::TICKET::] P15-4: reactor exposes the single client-owned EventBus on the RuntimeHandle
    async fn reactor_exposes_event_bus() {
        let (handle, join) = spawn_reactor();
        let bus = handle.event_bus();
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
            "publishing on the single client-owned bus must reach a subscriber"
        );
        shutdown_reactor(handle, join).await;
    }

    #[tokio::test]
    // @verifies C030
    // [::TICKET::] P11-6: SendDtmf dispatch spawns the timeout after backend success
    async fn send_dtmf_dispatch_spawns_timeout_after_backend_ok() {
        let config = ClientConfig::default();
        let (handle, join) = CoreReactor::spawn(BootConfig {
            config,
            dtmf_sent_timeout_ms: 50,
            event_bus: EventBus::new(
                crate::api::eventbus_receiver::DEFAULT_EVENT_BUS_CAPACITY,
                None,
            ),
            audio_taps: Arc::new(Mutex::new(HashMap::new())),
        })
        .unwrap();
        let mut rx = handle.event_bus().subscribe_control();

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
        let mut backend = TestBackend::new();
        let client_state = ClientState::default();

        let mut ctx = SendDtmfContext {
            backend: &mut backend,
            client_state: &client_state,
            event_bus: &bus,
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
        let mut backend = TestBackend::new();
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
        let mut ctx = SendDtmfContext {
            backend: &mut backend,
            client_state: &client_state,
            event_bus: &bus,
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
        let mut backend = TestBackend::new();
        backend.send_dtmf_result = Some(Err(crate::runtime::command::ReactorError::BackendError(
            "send failed".into(),
        )));
        let client_state = ClientState::default();

        let mut ctx = SendDtmfContext {
            backend: &mut backend,
            client_state: &client_state,
            event_bus: &bus,
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
        assert_eq!(id, 1, "TestBackend assigns the first account id 1");
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
// [::TICKET::] P12-1, P12-8, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P12-8|P15-3) --for-spec --no-implementation-order`.
    fn handle_make_call_registers_entry_and_returns_id() {
        let mut backend = TestBackend::new();
        let mut client_state = ClientState::default();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut empty_directions(),
        };
        let id = handle_make_call(&mut backend, &mut call_state, 1, &test_call_request())
            .unwrap_or_else(|error| panic!("make_call must succeed: {error}"));
        assert_eq!(id, 1, "TestBackend assigns the first call id 1");
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
// [::TICKET::] P12-1, P12-8, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P12-8|P15-3) --for-spec --no-implementation-order`.
    fn handle_make_call_error_registers_nothing() {
        let mut backend = TestBackend::new();
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
        assert_eq!(call_id, 1, "TestBackend assigns the first call id 1");
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
                register_on_start: None,
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
                register_on_start: None,
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
    // @verifies C039, C046, C085
    // [::TICKET::] P12-7: a NativeEvent injected through the handle's ingestion
    // receiver reaches process_native_event on the reactor thread.
    // [::TICKET::] P15-5: §62.4 — a fresh Disabled account receiving a native
    // registration event is an invalid §17.1 edge (Disabled→Idle), so no event is
    // published and ClientState stays Disabled (C085 invariant).
    async fn reactor_enqueued_registration_state_changed_for_disabled_account_stays_disabled(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let account_id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        let mut rx = handle.event_bus().subscribe_control();

        handle.enqueue_native_event(NativeEvent::RegistrationStateChanged {
            acc_id: account_id as u32,
        })?;

        let timeout = tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await;
        assert!(
            timeout.is_err(),
            "a Disabled account must not publish a registration event (invalid edge)"
        );
        let state = handle.query_state().await?;
        assert_eq!(
            state.accounts[&test_account(1)].registration,
            RegistrationState::Disabled
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    // ── P15-5: §62.4 registration state machine production wiring ──────

    /// Build an `accounts` map with a single account whose registration is
    /// `state` and whose native id matches `acc_id` (TestBackend id == logical id).
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn account_with_registration(
        acc_id: u32,
        state: RegistrationState,
    ) -> BTreeMap<AccountId, AccountEntry> {
        BTreeMap::from([(
            test_account(acc_id as u64),
            AccountEntry {
                id: acc_id as u64,
                native_id: acc_id as i32,
                config: crate::config::account_config_spec::AccountConfig::default(),
                registration: state,
            },
        )])
    }

    /// @verifies C073, C085
    /// P15-5: a native 200 registration event drives the §17 state machine from
    /// Registering to Registered, updates ClientState, and publishes
    /// `SipEventPayload::RegistrationStateChanged(Registered)`.
    #[tokio::test]
    async fn process_native_event_drives_registration_state_machine(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account(&crate::config::account_config_spec::AccountConfig::default())?;
        backend.mark_registered(1); // get_account_info -> status 200

        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::new();
        let mut accounts = account_with_registration(1, RegistrationState::Registering);

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
            &mut accounts,
        );

        let ev = rx
            .recv()
            .await
            .unwrap_or_else(|e| panic!("expected registration event: {e}"));
        assert!(
            matches!(
                ev.payload,
                SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
            ),
            "expected RegistrationStateChanged(Registered), got {:?}",
            ev.payload
        );
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Registered
        );
        Ok(())
    }

    /// @verifies C085
    /// P15-5: a success event for a Disabled account is an invalid §17 edge —
    /// no event is published, ClientState stays Disabled, reactor stays alive.
    #[tokio::test]
    async fn process_native_event_ignores_invalid_registration_transition(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account(&crate::config::account_config_spec::AccountConfig::default())?;
        backend.mark_registered(1); // native reports 200, but current is Disabled

        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let mut calls = BTreeMap::new();
        let mut accounts = account_with_registration(1, RegistrationState::Disabled);

        let mut call_state = CallStateTables {
            calls: &mut calls,
            call_directions: &mut empty_directions(),
        };
        process_native_event(
            &backend,
            &bus,
            NativeEvent::RegistrationStateChanged { acc_id: 1 },
            &mut call_state,
            &mut accounts,
        );

        let timeout = tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await;
        assert!(
            timeout.is_err(),
            "invalid transition must not publish an event"
        );
        assert_eq!(
            accounts[&test_account(1)].registration,
            RegistrationState::Disabled
        );
        Ok(())
    }

    /// @verifies C073
    /// P15-5: an UpdateAccount carrying `register_on_start: Some(true)` consumes
    /// the flag at runtime — the reactor advances ClientState to Registering
    /// (via backend.set_registration) after updating the config.
    #[tokio::test]
    async fn update_account_register_on_start_consumes_set_registration(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let account_id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        handle
            .submit_update_account(
                account_id,
                crate::config::account_config_spec::AccountConfig::default(),
                Some(true),
            )
            .await?;

        let state = handle.query_state().await?;
        assert_eq!(
            state.accounts[&test_account(1)].registration,
            RegistrationState::Registering
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }

    // ── P15-6: handle_answer / handle_hangup / handle_transfer ─────────

    /// @verifies C086
    #[tokio::test]
    async fn handle_answer_200_publishes_call_connected() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let bus = crate::api::eventbus_receiver::EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let call_id = CallId::from_u64(1)?;
        let account_id = AccountId::from_u64(5)?;
        let mut client_state = ClientState::default();
        client_state.calls.insert(
            call_id,
            CallEntry {
                id: 1,
                native_id: 1,
                account_id,
                state: "Incoming".into(),
                media: "none".into(),
            },
        );
        let mut call_directions = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut call_directions,
        };

        handle_answer(&mut backend, &bus, &mut call_state, 1, 200)?;
        assert_eq!(
            backend.answer_calls,
            vec![(1, 200)],
            "backend.answer_call must be invoked with (native_call_id, code)"
        );
        assert_eq!(
            client_state.calls[&call_id].state,
            "Active",
            "a 200 answer must mark the call Active"
        );

        let ev = rx.recv().await?;
        assert!(
            matches!(ev.payload, SipEventPayload::CallConnected(_)),
            "a 200 answer must publish CallConnected, got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.account_id, Some(account_id));
        assert_eq!(ev.meta.call_id, Some(call_id));
        Ok(())
    }

    /// @verifies C086
    #[tokio::test]
    async fn handle_answer_486_publishes_call_disconnected() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = TestBackend::new();
        let bus = crate::api::eventbus_receiver::EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let call_id = CallId::from_u64(1)?;
        let account_id = AccountId::from_u64(5)?;
        let mut client_state = ClientState::default();
        client_state.calls.insert(
            call_id,
            CallEntry {
                id: 1,
                native_id: 1,
                account_id,
                state: "Incoming".into(),
                media: "none".into(),
            },
        );
        let mut call_directions = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut call_directions,
        };

        handle_answer(&mut backend, &bus, &mut call_state, 1, 486)?;
        assert_eq!(backend.answer_calls, vec![(1, 486)]);
        assert_eq!(
            client_state.calls[&call_id].state,
            "Disconnected",
            "a 486 decline must mark the call Disconnected"
        );

        let ev = rx.recv().await?;
        assert!(
            matches!(ev.payload, SipEventPayload::CallDisconnected),
            "a 486 decline must publish CallDisconnected, got {:?}",
            ev.payload
        );
        Ok(())
    }

    /// @verifies C086
    #[tokio::test]
    async fn handle_answer_180_publishes_no_terminal_event() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = TestBackend::new();
        let bus = crate::api::eventbus_receiver::EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let call_id = CallId::from_u64(1)?;
        let account_id = AccountId::from_u64(5)?;
        let mut client_state = ClientState::default();
        client_state.calls.insert(
            call_id,
            CallEntry {
                id: 1,
                native_id: 1,
                account_id,
                state: "Incoming".into(),
                media: "none".into(),
            },
        );
        let mut call_directions = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut call_directions,
        };

        handle_answer(&mut backend, &bus, &mut call_state, 1, 180)?;
        assert_eq!(backend.answer_calls, vec![(1, 180)]);
        assert_eq!(
            client_state.calls[&call_id].state,
            "Connecting",
            "a provisional 180 answer must leave the call Connecting"
        );

        let timeout = tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await;
        assert!(
            timeout.is_err(),
            "a provisional answer must publish no terminal event"
        );
        Ok(())
    }

    /// @verifies C074
    #[tokio::test]
    async fn handle_hangup_publishes_call_disconnected() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let bus = crate::api::eventbus_receiver::EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let call_id = CallId::from_u64(1)?;
        let account_id = AccountId::from_u64(5)?;
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
        let mut call_directions = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut call_directions,
        };

        handle_hangup(
            &mut backend,
            &bus,
            &mut call_state,
            1,
            crate::call::HangupReason::LocalUser,
        )?;
        assert_eq!(backend.hangup_calls, vec![1]);
        assert_eq!(
            client_state.calls[&call_id].state,
            "Disconnected",
            "hangup must mark the call Disconnected"
        );

        let ev = rx.recv().await?;
        assert!(
            matches!(ev.payload, SipEventPayload::CallDisconnected),
            "hangup must publish CallDisconnected, got {:?}",
            ev.payload
        );
        assert_eq!(ev.meta.account_id, Some(account_id));
        Ok(())
    }

    /// @verifies C074
    #[tokio::test]
    async fn handle_transfer_marks_call_transferring() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let call_id = CallId::from_u64(1)?;
        let account_id = AccountId::from_u64(5)?;
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
        let mut call_directions = BTreeMap::new();
        let mut call_state = CallStateTables {
            calls: &mut client_state.calls,
            call_directions: &mut call_directions,
        };

        handle_transfer(&mut backend, &mut call_state, 1, "sip:bob@example.com")?;
        assert_eq!(
            backend.transfer_calls,
            vec![(1, "sip:bob@example.com".to_string())],
            "backend.transfer_call must be invoked with (native_call_id, target)"
        );
        assert_eq!(
            client_state.calls[&call_id].state,
            "Transferring",
            "transfer must mark the call Transferring"
        );
        Ok(())
    }

    /// @verifies C086
    #[tokio::test]
    async fn answer_dispatch_publishes_call_connected() -> Result<(), Box<dyn std::error::Error>> {
        let (handle, join) = spawn_reactor();
        let bus = handle.event_bus();
        let mut rx = bus.subscribe_control();
        let account_id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        let call_id = handle.submit_make_call(account_id, test_call_request()).await?;
        handle.submit_answer(call_id, 200).await?;

        let ev = rx.recv().await?;
        assert!(
            matches!(ev.payload, SipEventPayload::CallConnected(_)),
            "answer(200) dispatch must publish CallConnected, got {:?}",
            ev.payload
        );
        shutdown_reactor(handle, join).await;
        Ok(())
    }
}

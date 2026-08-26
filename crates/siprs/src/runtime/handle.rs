// [::TICKET::] P0-2: RuntimeHandle — Send+Sync handle for submitting commands to reactor

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread::JoinHandle;

use crate::api::eventbus_receiver::EventBus;
use crate::runtime::audio_worker::AudioMixer;
use crate::runtime::command::{DebugBox, DispatchCommand, ReactorError, Reply, RuntimeCommand};

/// A `Send + Sync` handle for submitting commands to the `CoreReactor`.
///
/// # Send + Sync safety
/// - `UnboundedSender<DispatchCommand>`: `Send + Sync`.
/// - `Arc<AtomicBool>`: `Send + Sync`.
/// - `Arc<JoinHandle<()>>`: `Send + Sync`.
/// - `Arc<AudioMixer>`: `Send + Sync` (DashMap + crossbeam ArrayQueue).
///
/// # Usage
/// ```rust,ignore
/// let (handle, join) = CoreReactor::spawn(config).unwrap();
/// let result = handle.submit(RuntimeCommand::Shutdown { reply: ... }).await;
/// join.join().unwrap();
/// ```
#[derive(Clone)]
pub struct RuntimeHandle {
    pub(crate) sender: tokio::sync::mpsc::UnboundedSender<DispatchCommand>,
    terminated: Arc<AtomicBool>,
    // [::TICKET::] P12-6: the reactor thread's JoinHandle, shared with the spawn
    // caller via Arc so the FFI thread-lifecycle observer can query liveness.
    join_handle: Arc<JoinHandle<()>>,
    // [::TICKET::] P11-3, P15-7: O-001 — the reactor owns per-call AudioMixers
    // keyed by call_id (§62.6). This shared map clone lets tests/observability
    // read the per-call mixer state without a round-trip command. The
    // single-writer rule still holds: only the reactor thread mutates mixers;
    // callers must treat this as read-only.
    audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>,
    // [::TICKET::] P15-4: the single client-owned EventBus (O-001 pattern).
    // This clone lets tests/observability subscribe to the same bus that
    // SipClient::subscribe() reads — the reactor publishes directly to it.
    event_bus: EventBus,
}

// [::TICKET::] P0-2, P0-5, P0-6, P7-2, P8-1, P10-3, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P7-2|P8-1|P10-3|P10-4) --for-spec --no-implementation-order`.
// [::TICKET::] P11-3: AudioMixer does not implement Debug, so the Debug impl is
// hand-written to format only the Debug-able fields (sender/terminated) and omit
// the mixer (same finish_non_exhaustive pattern as Reply/DebugBox).
// [::TICKET::] P11-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-3 --for-spec --no-implementation-order`.
impl std::fmt::Debug for RuntimeHandle {
    // [::TICKET::] P11-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-3 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RuntimeHandle")
            .field("sender", &self.sender)
            .field("terminated", &self.terminated)
            .finish_non_exhaustive()
    }
}

// [::TICKET::] P0-2, P0-5, P0-6, P7-2, P8-1, P10-3, P10-4, P11-3, P11-6, P11-7, P12-6, P12-1, P12-7, P15-4, P15-5, P15-6, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P7-2|P8-1|P10-3|P10-4|P11-3|P11-6|P11-7|P12-6|P12-1|P12-7|P15-4|P15-5|P15-6|P15-7) --for-spec --no-implementation-order`.
impl RuntimeHandle {
    pub(crate) fn new(
        sender: tokio::sync::mpsc::UnboundedSender<DispatchCommand>,
        terminated: Arc<AtomicBool>,
        join_handle: Arc<JoinHandle<()>>,
        audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>,
        event_bus: EventBus,
    ) -> Self {
        Self {
            sender,
            terminated,
            join_handle,
            audio_mixers,
            event_bus,
        }
    }

    /// Return a clone of the reactor-owned per-call `AudioMixer` for `call_id`.
    ///
    /// This is an observability/test accessor (O-001): it lets callers read the
    /// per-call mixer state (`source_count()`, `in_source_count()`, `gains`,
    /// `mutes`) without a round-trip command. `None` when no mixer has been
    /// created for the call yet. The single-writer rule still applies — only
    /// the reactor thread mutates mixers; callers must not call the `*_source`
    /// mutators directly.
    pub fn audio_mixer_for(&self, call_id: u64) -> Option<Arc<AudioMixer>> {
        self.audio_mixers.read().unwrap_or_else(|e| e.into_inner()).get(&call_id).cloned()
    }

    /// Return a clone of the single client-owned `EventBus`.
    ///
    /// This is an observability/test accessor (O-001): it lets callers subscribe
    /// to the same bus that `SipClient::subscribe()` reads. The reactor publishes
    /// directly to this bus, so any subscriber sees reactor-initiated events
    /// (e.g. the DtmfSent timeout fallback). Publishing on any clone reaches all
    /// subscribers.
    pub fn event_bus(&self) -> EventBus {
        self.event_bus.clone()
    }

    /// Return the reactor thread's `JoinHandle` Arc (identity/liveness probe).
    ///
    /// This is an observability accessor (O-001): it lets an FFI thread-lifecycle
    /// observer (P8-21) query reactor-thread liveness via `JoinHandle::is_finished`
    /// without a round-trip command. The returned Arc is the same allocation the
    /// `CoreReactor::spawn` caller holds, so `Arc::ptr_eq` and `Thread::id`
    /// equality verify they refer to the same OS thread.
    pub fn thread_handle(&self) -> &Arc<JoinHandle<()>> {
        &self.join_handle
    }

    /// Return `true` while the reactor thread is running.
    ///
    /// Non-blocking, lock-free read: `false` once the thread has exited
    /// (graceful shutdown, panic, or channel-close).
    pub fn is_thread_alive(&self) -> bool {
        !self.join_handle.is_finished()
    }

    /// Submit a runtime command and await its completion.
    ///
    /// The command is enqueued on the unbounded MPSC channel. The reactor
    /// thread processes it in FIFO order and sends the result back.
    ///
    /// # Errors
    /// Returns `ReactorError::ReactorDown` if the reactor has terminated.
    pub async fn submit(&self, command: RuntimeCommand) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let dispatch = DispatchCommand::from_runtime_command(command);
        let (tx, rx) = tokio::sync::oneshot::channel();

        // Inject our reply channel
        let dispatch = match dispatch {
            DispatchCommand::Execute { f, .. } => DispatchCommand::Execute {
                f,
                reply: Reply::new(tx),
            },
            DispatchCommand::Shutdown { .. } => DispatchCommand::Shutdown {
                reply: Reply::new(tx),
            },
            DispatchCommand::SendDtmf {
                call_id,
                method,
                digits,
                ..
            } => DispatchCommand::SendDtmf {
                call_id,
                method,
                digits,
                reply: Reply::new(tx),
            },
            // AddAccount has a typed Result<u64> reply — handled via submit_add_account.
            DispatchCommand::AddAccount { .. } => {
                unreachable!("use submit_add_account instead")
            }
            // MakeCall has a typed Result<u64> reply — handled via submit_make_call.
            DispatchCommand::MakeCall { .. } => {
                unreachable!("use submit_make_call instead")
            }
            // [::TICKET::] P15-6: call-control commands need reactor-side state
            // updates + event publish, so they have dedicated submit_* methods.
            DispatchCommand::Answer { .. } => {
                unreachable!("use submit_answer instead")
            }
            DispatchCommand::Hangup { .. } => {
                unreachable!("use submit_hangup instead")
            }
            DispatchCommand::Transfer { .. } => {
                unreachable!("use submit_transfer instead")
            }
            DispatchCommand::UpdateAccount {
                account_id,
                config,
                register_on_start,
                ..
            } => DispatchCommand::UpdateAccount {
                account_id,
                config,
                register_on_start,
                reply: Reply::new(tx),
            },
            DispatchCommand::RemoveAccount { account_id, .. } => DispatchCommand::RemoveAccount {
                account_id,
                reply: Reply::new(tx),
            },
            DispatchCommand::CreateTransport { config, .. } => DispatchCommand::CreateTransport {
                config,
                reply: Reply::new(tx),
            },
            DispatchCommand::SetRegistration {
                account_id,
                enabled,
                ..
            } => DispatchCommand::SetRegistration {
                account_id,
                enabled,
                reply: Reply::new(tx),
            },
            // Audio-lifecycle commands with a Result<()> reply are handled directly;
            // the dedicated submit_*_audio_* methods are typed conveniences.
            DispatchCommand::RemoveAudioSource { source_id, .. } => {
                DispatchCommand::RemoveAudioSource {
                    source_id,
                    reply: Reply::new(tx),
                }
            }
            DispatchCommand::SetAudioSourceGain {
                source_id, gain, ..
            } => DispatchCommand::SetAudioSourceGain {
                source_id,
                gain,
                reply: Reply::new(tx),
            },
            DispatchCommand::MuteAudioSource {
                source_id, muted, ..
            } => DispatchCommand::MuteAudioSource {
                source_id,
                muted,
                reply: Reply::new(tx),
            },
            // GetAccountInfo handled via separate method
            DispatchCommand::GetAccountInfo { .. } => {
                unreachable!("use submit_get_account_info instead")
            }
            // AddAudioSource handled via separate method (Result<u64> reply)
            DispatchCommand::AddAudioSource { .. } => {
                unreachable!("use submit_add_audio_source instead")
            }
            // QueryState handled via separate method
            DispatchCommand::QueryState { .. } => {
                unreachable!("use query_state instead")
            }
            // NativeEvent is fire-and-forget — handled via enqueue_native_event.
            DispatchCommand::NativeEvent { .. } => {
                unreachable!("use enqueue_native_event instead")
            }
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P0-5: Submit a GetAccountInfo command and await the result.
    ///
    /// Separate from `submit()` because the response type is
    /// `AccountInfoSnapshot` rather than `()`.
    pub async fn submit_get_account_info(
        &self,
        native_acc_id: u32,
    ) -> Result<crate::state::m20_registr_cmd_pat::AccountInfoSnapshot, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::GetAccountInfo {
            native_acc_id,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P7-2: O-004 — query the reactor's authoritative `ClientState`.
    ///
    /// Backs `SipClient::accounts()` / `SipClient::call_state()`. The query reads
    /// the reactor's local state clone — it never blocks the reactor thread and
    /// is independent of the event stream (C021 source-of-truth invariant).
    pub async fn query_state(&self) -> Result<crate::runtime::state::ClientState, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::QueryState {
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P10-3: add an account and await the assigned logical id.
    ///
    /// Separate from `submit()` because the response type is `u64` (the
    /// backend-assigned account id) rather than `()`. Follows the
    /// `submit_get_account_info` / `submit_add_audio_source` typed-reply pattern.
    pub async fn submit_add_account(
        &self,
        config: crate::config::account_config_spec::AccountConfig,
    ) -> Result<u64, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::AddAccount {
            config,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// Submit a `MakeCall` command and await the assigned logical CallId.
    ///
    /// Separate from `submit()` because the response type is `u64` (the
    /// backend-assigned call id) rather than `()`. Follows the
    /// `submit_add_account` / `submit_add_audio_source` typed-reply pattern
    /// (P12-1).
    ///
    /// # Errors
    /// Returns `ReactorError::ReactorDown` if the reactor has terminated, or the
    /// reactor's reply error if the backend rejected the call.
    pub async fn submit_make_call(
        &self,
        account_id: u64,
        request: crate::api::call_types::OutgoingCallRequest,
    ) -> Result<u64, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::MakeCall {
            account_id,
            request: Box::new(request),
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P15-6: submit an `Answer` command and await the reactor's reply.
    ///
    /// Separate from `submit()` because the reactor needs the dedicated
    /// `DispatchCommand::Answer` variant (state update + event publish). The code
    /// has already passed `validate_answer_code` at the facade.
    pub async fn submit_answer(&self, call_id: u64, code: u16) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::Answer {
            call_id,
            code,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P15-6: submit a `Hangup` command carrying the reason.
    pub async fn submit_hangup(
        &self,
        call_id: u64,
        reason: crate::call::HangupReason,
    ) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::Hangup {
            call_id,
            reason,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P15-6: submit a `Transfer` command and await the reactor's reply.
    pub async fn submit_transfer(
        &self,
        call_id: u64,
        target: String,
    ) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::Transfer {
            call_id,
            target,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// [::TICKET::] P15-6: query a single call's signalling state.
    ///
    /// Reads the authoritative `ClientState` via `query_state` (C021), maps the
    /// `CallEntry.state` string to the public `CallState` enum, and returns
    /// `BackendError("call not found")` when the call id is unknown.
    pub async fn call_state(
        &self,
        call_id: crate::model::CallId,
    ) -> Result<crate::state::call_state_model::CallState, ReactorError> {
        let state = self.query_state().await?;
        state
            .calls
            .get(&call_id)
            .map(|entry| crate::api::call_api_expansion::call_state_from_entry_state(&entry.state))
            .ok_or_else(|| ReactorError::BackendError("call not found".into()))
    }

    /// Submit an `UpdateAccount` command and await the reactor's reply.
    ///
    /// Builds the oneshot channel itself and returns the reactor's
    /// `Result<(), ReactorError>` directly, so callers never need a dummy reply
    /// channel — the reactor's outcome is always surfaced.
    ///
    /// `register_on_start` is the patch delta (§62.4): when `Some`, the reactor
    /// re-issues registration after the config update.
    ///
    /// # Errors
    /// Returns `ReactorError::ReactorDown` if the reactor has terminated, or the
    /// reactor's reply error if the backend rejected the update.
    pub async fn submit_update_account(
        &self,
        account_id: u64,
        config: crate::config::account_config_spec::AccountConfig,
        register_on_start: Option<bool>,
    ) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::UpdateAccount {
            account_id,
            config,
            register_on_start,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    // [::TICKET::] P8-1: O-003 — audio-lifecycle submit methods. Each follows the
    // submit_get_account_info / query_state pattern: build the DispatchCommand with a
    // fresh oneshot, enqueue on the MPSC channel, await the typed reply.

    /// Submit an `AddAudioSource` command and await the assigned `source_id`.
    ///
    /// The source is added to the per-call mixer for `call_id` on the path(s)
    /// selected by `channels` (§62.6).
    ///
    /// # Errors
    /// Returns `ReactorError::ReactorDown` if the reactor has terminated, or the
    /// reactor's backend error if the source could not be added.
    pub async fn submit_add_audio_source(
        &self,
        call_id: u64,
        source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>,
        channels: crate::audio::media_path_arch::ChannelSelector,
    ) -> Result<u64, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::AddAudioSource {
            call_id,
            source: DebugBox::new(source),
            channels,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// Submit a `RemoveAudioSource` command and await its completion.
    pub async fn submit_remove_audio_source(&self, source_id: u64) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::RemoveAudioSource {
            source_id,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// Submit a `SetAudioSourceGain` command and await its completion.
    pub async fn submit_set_audio_source_gain(
        &self,
        source_id: u64,
        gain: f32,
    ) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::SetAudioSourceGain {
            source_id,
            gain,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// Submit a `MuteAudioSource` command and await its completion.
    pub async fn submit_mute_audio_source(
        &self,
        source_id: u64,
        muted: bool,
    ) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::MuteAudioSource {
            source_id,
            muted,
            reply: Reply::new(tx),
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
    }

    /// Enqueue a `NativeEvent` for processing on the reactor thread.
    ///
    /// This is the RFC §27.3 (N0038) `Reactor::enqueue_native_event` ingestion
    /// receiver: the FFI callback bridge (P8-21) and tests deliver NativeEvents
    /// through this channel. Fire-and-forget (no oneshot reply) — events are
    /// observation-only per C021, so delivery is loss-tolerant broadcast.
    ///
    /// # Errors
    /// Returns `ReactorError::ReactorDown` if the reactor has terminated.
    pub fn enqueue_native_event(
        &self,
        event: crate::state::m20_native_event_conv::NativeEvent,
    ) -> Result<(), ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }
        self.sender
            .send(DispatchCommand::NativeEvent { event })
            .map_err(|_| ReactorError::ReactorDown)
    }

    /// Returns `true` if the reactor thread has terminated (panic or graceful shutdown).
    pub fn is_terminated(&self) -> bool {
        self.terminated.load(Ordering::Acquire)
    }
}

/// Create the MPSC channel pair for reactor communication.
pub(crate) fn create_channel() -> (
    tokio::sync::mpsc::UnboundedSender<DispatchCommand>,
    tokio::sync::mpsc::UnboundedReceiver<DispatchCommand>,
) {
    tokio::sync::mpsc::unbounded_channel()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::audio_worker::MockAsyncAudioSource;

    /// @verifies C012: RuntimeHandle must be Send + Sync.
    const _: () = {
        const fn assert_send<T: Send>() {}
        const fn assert_sync<T: Sync>() {}
        assert_send::<RuntimeHandle>();
        assert_sync::<RuntimeHandle>();
    };

    /// Build a real `Arc<JoinHandle<()>>` whose thread has already completed.
    ///
    /// Used by construction tests that only need a valid, non-optional handle.
    /// The thread signals completion via the channel and exits on its own, so
    /// the JoinHandle is never joined — it stays valid and `is_finished()` is true.
    // [::TICKET::] P12-6, P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-6|P12-1) --for-spec --no-implementation-order`.
    fn completed_join_handle() -> Arc<JoinHandle<()>> {
        let (tx, rx) = std::sync::mpsc::channel();
        let handle = std::thread::spawn(move || {
            let _ = tx.send(());
        });
        rx.recv().expect("thread must signal completion");
        Arc::new(handle)
    }

    #[test]
    // @verifies C012
// [::TICKET::] P0-2, P11-3, P11-6, P12-6, P12-1, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P11-3|P11-6|P12-6|P12-1|P15-7) --for-spec --no-implementation-order`.
    fn runtime_handle_is_clonable() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let cloned = handle.clone();
        assert!(!cloned.is_terminated());
    }

    #[tokio::test]
    // @verifies C047
    async fn submit_returns_err_when_terminated() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(true));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let (_tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Shutdown {
            reply: Reply::new(_tx),
        };
        let result = handle.submit(cmd).await;
        assert!(result.is_err(), "submit must return Err when terminated");
    }

    #[test]
// [::TICKET::] P0-2, P11-3, P11-6, P12-6, P12-1, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P11-3|P11-6|P12-6|P12-1|P15-7) --for-spec --no-implementation-order`.
    fn is_terminated_reflects_atomic_flag() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated.clone(),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        assert!(!handle.is_terminated());
        terminated.store(true, Ordering::Release);
        assert!(handle.is_terminated());
    }

    // ── O-003: audio-lifecycle submit methods ──────────────────────────

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-003 — submit_add_audio_source must send DispatchCommand::AddAudioSource
    // and deliver the reply (source_id) to the caller.
    async fn submit_add_audio_source_returns_source_id() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::AddAudioSource {
                    call_id,
                    source,
                    channels,
                    reply,
                }) => {
                    assert_eq!(call_id, 42);
                    assert_eq!(
                        channels,
                        crate::audio::media_path_arch::ChannelSelector::Out
                    );
                    drop(source);
                    reply.send(Ok(42u64)).unwrap();
                }
                other => panic!("expected AddAudioSource, got {other:?}"),
            }
        });

        let source = Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
        let result = handle
            .submit_add_audio_source(
                42,
                source,
                crate::audio::media_path_arch::ChannelSelector::Out,
            )
            .await;
        assert_eq!(
            result.unwrap(),
            42,
            "source_id must be delivered via oneshot"
        );
        consumer.await.unwrap();
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-003 — submit_remove_audio_source must send DispatchCommand::RemoveAudioSource.
    async fn submit_remove_audio_source_sends_typed_command() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::RemoveAudioSource { source_id, reply }) => {
                    assert_eq!(source_id, 7);
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected RemoveAudioSource, got {other:?}"),
            }
        });

        let result = handle.submit_remove_audio_source(7).await;
        assert!(result.is_ok(), "remove must complete with Ok");
        consumer.await.unwrap();
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-003 — submit_set_audio_source_gain must send DispatchCommand::SetAudioSourceGain.
    async fn submit_set_audio_source_gain_sends_typed_command() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::SetAudioSourceGain {
                    source_id,
                    gain,
                    reply,
                }) => {
                    assert_eq!(source_id, 3);
                    assert!((gain - 0.5).abs() < f32::EPSILON);
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected SetAudioSourceGain, got {other:?}"),
            }
        });

        let result = handle.submit_set_audio_source_gain(3, 0.5).await;
        assert!(result.is_ok(), "set_gain must complete with Ok");
        consumer.await.unwrap();
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-003 — submit_mute_audio_source must send DispatchCommand::MuteAudioSource.
    async fn submit_mute_audio_source_sends_typed_command() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::MuteAudioSource {
                    source_id,
                    muted,
                    reply,
                }) => {
                    assert_eq!(source_id, 5);
                    assert!(muted);
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected MuteAudioSource, got {other:?}"),
            }
        });

        let result = handle.submit_mute_audio_source(5, true).await;
        assert!(result.is_ok(), "mute must complete with Ok");
        consumer.await.unwrap();
    }

    // ── P10-3: submit_add_account (typed u64 reply) ────────────────────

    #[tokio::test]
    // @verifies C012
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn submit_add_account_returns_assigned_id() -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::AddAccount { config: _, reply }) => {
                    // The reactor replies with the backend-assigned id (first = 1).
                    reply.send(Ok(1u64)).unwrap();
                }
                other => panic!("expected AddAccount, got {other:?}"),
            }
        });

        let id = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await?;
        assert_eq!(id, 1, "the reply id must be surfaced to the caller");
        consumer.await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C017
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn submit_add_account_reactor_down_returns_err() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(true));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        let result = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await;
        assert!(
            matches!(result, Err(ReactorError::ReactorDown)),
            "a terminated reactor must map to ReactorDown"
        );
    }

    // ── P11-7: submit_update_account (typed Result<(), ReactorError> reply) ─

    #[tokio::test]
    // @verifies C052
    async fn submit_update_account_returns_reactor_reply() -> Result<(), Box<dyn std::error::Error>>
    {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::UpdateAccount {
                    account_id,
                    register_on_start,
                    reply,
                    ..
                }) => {
                    assert_eq!(account_id, 7);
                    assert_eq!(register_on_start, None);
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected UpdateAccount, got {other:?}"),
            }
        });

        let result = handle
            .submit_update_account(
                7,
                crate::config::account_config_spec::AccountConfig::default(),
                None,
            )
            .await;
        assert_eq!(
            result,
            Ok(()),
            "the reactor reply must be surfaced to the caller"
        );
        consumer.await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C052
    async fn submit_update_account_reactor_down_returns_err() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(true));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        let result = handle
            .submit_update_account(
                1,
                crate::config::account_config_spec::AccountConfig::default(),
                None,
            )
            .await;
        assert!(
            matches!(result, Err(ReactorError::ReactorDown)),
            "a terminated reactor must map to ReactorDown"
        );
    }

    // ── P12-1: submit_make_call (typed Result<u64, ReactorError> reply) ──

    /// Shared test request for the submit_make_call tests.
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

    #[tokio::test]
    // @verifies C070
    // [::TICKET::] P12-1: submit_make_call sends DispatchCommand::MakeCall and
    // delivers the reply (the assigned CallId) to the caller.
    async fn submit_make_call_returns_assigned_id() -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::MakeCall {
                    account_id,
                    request,
                    reply,
                }) => {
                    assert_eq!(account_id, 7);
                    assert_eq!(request.target_uri, "sip:bob@example.com");
                    // The reactor replies with the backend-assigned call id.
                    reply.send(Ok(42u64)).unwrap();
                }
                other => panic!("expected MakeCall, got {other:?}"),
            }
        });

        let id = handle.submit_make_call(7, test_call_request()).await?;
        assert_eq!(id, 42, "the reply id must be surfaced to the caller");
        consumer.await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C070
    // [::TICKET::] P12-1: submit_make_call on a terminated reactor must map to
    // ReactorDown (never hang and never fabricate an id).
    async fn submit_make_call_reactor_down_returns_err() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(true));
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        let result = handle.submit_make_call(7, test_call_request()).await;
        assert!(
            matches!(result, Err(ReactorError::ReactorDown)),
            "a terminated reactor must map to ReactorDown"
        );
    }

    // ── P15-4: single-EventBus exposure (O-001 pattern) ──

    #[tokio::test]
    // @verifies C069
    // [::TICKET::] P15-4: RuntimeHandle exposes the single client-owned EventBus
    async fn runtime_handle_exposes_event_bus() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let event_bus = crate::api::eventbus_receiver::EventBus::new(16, None);
        let handle = RuntimeHandle::new(
            tx,
            terminated,
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            event_bus.clone(),
        );

        let bus = handle.event_bus();
        let mut rx = bus.subscribe_control();
        bus.publish(crate::api::event_model_payload_bus::SipEvent {
            meta: crate::api::event_model_payload_bus::EventMeta::new(0, None, None),
            payload: crate::api::event_model_payload_bus::SipEventPayload::ClientShutdown,
        });
        let ev = rx.try_recv().unwrap();
        assert!(
            matches!(
                ev.payload,
                crate::api::event_model_payload_bus::SipEventPayload::ClientShutdown
            ),
            "publishing on the exposed bus must reach a subscriber"
        );
    }

    // ── P12-6: Arc<JoinHandle> thread-lifecycle inspection ─────────────

    #[test]
    // @verifies C112
    // [::TICKET::] P12-6: thread_handle() must return the exact Arc passed to new().
// [::TICKET::] P12-6, P12-1, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-6|P12-1|P15-7) --for-spec --no-implementation-order`.
    fn thread_handle_returns_same_arc_allocation() {
        let join_arc = completed_join_handle();
        let handle = RuntimeHandle::new(
            create_channel().0,
            Arc::new(AtomicBool::new(false)),
            join_arc.clone(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        assert!(
            Arc::ptr_eq(handle.thread_handle(), &join_arc),
            "thread_handle() must return the SAME Arc allocation passed to new()"
        );
    }

    #[test]
    // @verifies C112
    // [::TICKET::] P12-6: a finished thread reports dead via is_thread_alive()/is_finished().
// [::TICKET::] P12-6, P12-1, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-6|P12-1|P15-7) --for-spec --no-implementation-order`.
    fn thread_inspection_reports_finished_after_thread_exits() {
        let join_arc = completed_join_handle(); // thread already finished, handle not joined
        let handle = RuntimeHandle::new(
            create_channel().0,
            Arc::new(AtomicBool::new(false)),
            join_arc,
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        assert!(
            !handle.is_thread_alive(),
            "completed thread must report dead"
        );
        assert!(
            handle.thread_handle().is_finished(),
            "completed thread's JoinHandle must be finished"
        );
    }

    #[test]
    // @verifies C012
    // [::TICKET::] P12-6: a cloned handle shares the identical Arc<JoinHandle> allocation.
// [::TICKET::] P12-6, P12-1, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-6|P12-1|P15-7) --for-spec --no-implementation-order`.
    fn cloned_handle_shares_same_arc_allocation() {
        let handle = RuntimeHandle::new(
            create_channel().0,
            Arc::new(AtomicBool::new(false)),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        let cloned = handle.clone();
        assert!(
            Arc::ptr_eq(cloned.thread_handle(), handle.thread_handle()),
            "clone must share the identical Arc<JoinHandle> allocation"
        );
        assert_eq!(cloned.is_thread_alive(), handle.is_thread_alive());
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P12-6: runtime/handle.rs must stay free of unsafe (C038 isolation).
    // [::TICKET::] P12-6, P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-6|P12-1) --for-spec --no-implementation-order`.
    fn runtime_handle_contains_no_unsafe() {
        let source = std::fs::read_to_string("src/runtime/handle.rs")
            .expect("handle.rs must exist at the crate root");
        for (i, line) in source.lines().enumerate() {
            assert!(
                !line.trim_start().starts_with("unsafe"),
                "runtime/handle.rs:{} must not contain unsafe",
                i + 1
            );
        }
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P12-6: inspection on a panicked thread must report dead without
    // panicking the accessor — is_finished() is safe on a dead/panicked thread.
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
    fn inspection_on_panicked_thread_reports_dead_safely() {
        let join_arc = Arc::new(std::thread::spawn(|| panic!("deliberate test panic")));
        let handle = RuntimeHandle::new(
            create_channel().0,
            Arc::new(AtomicBool::new(false)),
            join_arc,
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        // The thread panics immediately and exits; poll deterministically for exit.
        let mut attempts = 0;
        while handle.is_thread_alive() && attempts < 100 {
            std::thread::sleep(std::time::Duration::from_millis(1));
            attempts += 1;
        }
        assert!(
            handle.thread_handle().is_finished(),
            "panicked thread must report finished"
        );
        assert!(
            !handle.is_thread_alive(),
            "panicked thread must report not alive"
        );
    }

    // ── P12-7: enqueue_native_event ingestion receiver ────────────────

    #[tokio::test]
    // @verifies C039, C011
    // [::TICKET::] P12-7: enqueue_native_event transports the exact NativeEvent
    // payload to the reactor's MPSC channel (RFC §27.3 ingestion receiver).
    async fn enqueue_native_event_sends_dispatch_native_event(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let handle = RuntimeHandle::new(
            tx,
            Arc::new(AtomicBool::new(false)),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        handle.enqueue_native_event(
            crate::state::m20_native_event_conv::NativeEvent::DtmfDigit {
                call_id: 5,
                digit: '3',
            },
        )?;

        match rx
            .recv()
            .await
            .ok_or("reactor channel closed unexpectedly")?
        {
            DispatchCommand::NativeEvent { event } => {
                assert_eq!(
                    event,
                    crate::state::m20_native_event_conv::NativeEvent::DtmfDigit {
                        call_id: 5,
                        digit: '3',
                    }
                );
            }
            other => panic!("expected DispatchCommand::NativeEvent, got {other:?}"),
        }
        Ok(())
    }

    #[tokio::test]
    // @verifies C011
    // [::TICKET::] P12-7: enqueue_native_event on a terminated reactor must map to
    // ReactorDown (never hang and never fabricate a delivery).
    async fn enqueue_native_event_reactor_down_returns_err() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let handle = RuntimeHandle::new(
            tx,
            Arc::new(AtomicBool::new(true)),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );
        let result = handle
            .enqueue_native_event(crate::state::m20_native_event_conv::NativeEvent::NatDetected);
        assert!(
            matches!(result, Err(ReactorError::ReactorDown)),
            "a terminated reactor must map to ReactorDown"
        );
    }

    // ── P15-6: submit_answer / submit_hangup / submit_transfer ─────────

    #[tokio::test]
    // @verifies C086
    // [::TICKET::] P15-6: submit_answer sends DispatchCommand::Answer with the
    // (call_id, code) payload and delivers the reactor reply.
    async fn submit_answer_sends_dispatch_answer() -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let handle = RuntimeHandle::new(
            tx,
            Arc::new(AtomicBool::new(false)),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::Answer {
                    call_id,
                    code,
                    reply,
                }) => {
                    assert_eq!(call_id, 7);
                    assert_eq!(code, 200);
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected DispatchCommand::Answer, got {other:?}"),
            }
        });

        let result = handle.submit_answer(7, 200).await;
        assert!(result.is_ok(), "the reactor reply must be surfaced");
        consumer.await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C074
    // [::TICKET::] P15-6: submit_hangup sends DispatchCommand::Hangup carrying the
    // caller-supplied reason.
    async fn submit_hangup_sends_dispatch_hangup() -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let handle = RuntimeHandle::new(
            tx,
            Arc::new(AtomicBool::new(false)),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::Hangup {
                    call_id,
                    reason,
                    reply,
                }) => {
                    assert_eq!(call_id, 9);
                    assert_eq!(reason, crate::call::HangupReason::LocalUser);
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected DispatchCommand::Hangup, got {other:?}"),
            }
        });

        let result = handle
            .submit_hangup(9, crate::call::HangupReason::LocalUser)
            .await;
        assert!(result.is_ok(), "the reactor reply must be surfaced");
        consumer.await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C074
    // [::TICKET::] P15-6: submit_transfer sends DispatchCommand::Transfer with the
    // target URI.
    async fn submit_transfer_sends_dispatch_transfer() -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let handle = RuntimeHandle::new(
            tx,
            Arc::new(AtomicBool::new(false)),
            completed_join_handle(),
            Arc::new(RwLock::new(HashMap::new())),
            crate::api::eventbus_receiver::EventBus::new(16, None),
        );

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::Transfer {
                    call_id,
                    target,
                    reply,
                }) => {
                    assert_eq!(call_id, 3);
                    assert_eq!(target, "sip:bob@example.com");
                    let _ = reply.send(Ok(()));
                }
                other => panic!("expected DispatchCommand::Transfer, got {other:?}"),
            }
        });

        let result = handle
            .submit_transfer(3, "sip:bob@example.com".into())
            .await;
        assert!(result.is_ok(), "the reactor reply must be surfaced");
        consumer.await?;
        Ok(())
    }
}

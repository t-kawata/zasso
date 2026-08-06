// [::TICKET::] P0-2: RuntimeHandle — Send+Sync handle for submitting commands to reactor

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Weak;
use std::thread::JoinHandle;

use crate::runtime::command::{DispatchCommand, ReactorError, RuntimeCommand};

/// A `Send + Sync` handle for submitting commands to the `CoreReactor`.
///
/// # Send + Sync safety
/// - `UnboundedSender<DispatchCommand>`: `Send + Sync`.
/// - `Arc<AtomicBool>`: `Send + Sync`.
/// - `Weak<JoinHandle<()>>`: `Send + Sync`.
///
/// # Usage
/// ```rust,ignore
/// let (handle, join) = CoreReactor::spawn(config).unwrap();
/// let result = handle.submit(RuntimeCommand::Shutdown { reply: ... }).await;
/// join.join().unwrap();
/// ```
#[derive(Clone, Debug)]
pub struct RuntimeHandle {
    pub(crate) sender: tokio::sync::mpsc::UnboundedSender<DispatchCommand>,
    terminated: Arc<AtomicBool>,
// [::STUB::] P12-6: join_handle is a Weak<JoinHandle> and unused -- Upgrade the Weak<JoinHandle> to Arc and expose it for FFI thread lifecycle inspection once pjsua is linked
    #[allow(dead_code)]
    join_handle: Weak<JoinHandle<()>>,
}

// [::TICKET::] P0-2, P0-5, P0-6, P7-2, P8-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P7-2|P8-1|P10-3) --for-spec --no-implementation-order`.
impl RuntimeHandle {
    pub(crate) fn new(
        sender: tokio::sync::mpsc::UnboundedSender<DispatchCommand>,
        terminated: Arc<AtomicBool>,
        join_handle: Weak<JoinHandle<()>>,
    ) -> Self {
        Self {
            sender,
            terminated,
            join_handle,
        }
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
            DispatchCommand::Execute { f, .. } => DispatchCommand::Execute { f, reply: tx },
            DispatchCommand::Shutdown { .. } => DispatchCommand::Shutdown { reply: tx },
            // AddAccount has a typed Result<u64> reply — handled via submit_add_account.
            DispatchCommand::AddAccount { .. } => {
                unreachable!("use submit_add_account instead")
            }
            DispatchCommand::UpdateAccount { account_id, config, .. } => {
                DispatchCommand::UpdateAccount {
                    account_id,
                    config,
                    reply: tx,
                }
            }
            DispatchCommand::RemoveAccount { account_id, .. } => {
                DispatchCommand::RemoveAccount { account_id, reply: tx }
            }
            DispatchCommand::CreateTransport { config, .. } => {
                DispatchCommand::CreateTransport { config, reply: tx }
            }
            // Audio-lifecycle commands with a Result<()> reply are handled directly;
            // the dedicated submit_*_audio_* methods are typed conveniences.
            DispatchCommand::RemoveAudioSource { source_id, .. } => {
                DispatchCommand::RemoveAudioSource {
                    source_id,
                    reply: tx,
                }
            }
            DispatchCommand::SetAudioSourceGain { source_id, gain, .. } => {
                DispatchCommand::SetAudioSourceGain {
                    source_id,
                    gain,
                    reply: tx,
                }
            }
            DispatchCommand::MuteAudioSource { source_id, muted, .. } => {
                DispatchCommand::MuteAudioSource {
                    source_id,
                    muted,
                    reply: tx,
                }
            }
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
            reply: tx,
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
    pub async fn query_state(
        &self,
    ) -> Result<crate::runtime::state::ClientState, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::QueryState { reply: tx };

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
        let dispatch = DispatchCommand::AddAccount { config, reply: tx };

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
    /// # Errors
    /// Returns `ReactorError::ReactorDown` if the reactor has terminated, or the
    /// reactor's backend error if the source could not be added.
    pub async fn submit_add_audio_source(
        &self,
        source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>,
    ) -> Result<u64, ReactorError> {
        if self.is_terminated() {
            return Err(ReactorError::ReactorDown);
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let dispatch = DispatchCommand::AddAudioSource { source, reply: tx };

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
            reply: tx,
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
            reply: tx,
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
            reply: tx,
        };

        self.sender
            .send(dispatch)
            .map_err(|_| ReactorError::ReactorDown)?;

        rx.await.map_err(|_| ReactorError::ReactorDown)?
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

    #[test]
    // @verifies C012
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn runtime_handle_is_clonable() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

        let cloned = handle.clone();
        assert!(!cloned.is_terminated());
    }

    #[tokio::test]
    // @verifies C047
    async fn submit_returns_err_when_terminated() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(true));
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

        let (_tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Shutdown { reply: _tx };
        let result = handle.submit(cmd).await;
        assert!(result.is_err(), "submit must return Err when terminated");
    }

    #[test]
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn is_terminated_reflects_atomic_flag() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(tx, terminated.clone(), Weak::new());

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
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::AddAudioSource { source, reply }) => {
                    drop(source);
                    reply.send(Ok(42u64)).unwrap();
                }
                other => panic!("expected AddAudioSource, got {other:?}"),
            }
        });

        let source = Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
        let result = handle.submit_add_audio_source(source).await;
        assert_eq!(result.unwrap(), 42, "source_id must be delivered via oneshot");
        consumer.await.unwrap();
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-003 — submit_remove_audio_source must send DispatchCommand::RemoveAudioSource.
    async fn submit_remove_audio_source_sends_typed_command() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DispatchCommand>();
        let terminated = Arc::new(AtomicBool::new(false));
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::RemoveAudioSource { source_id, reply }) => {
                    assert_eq!(source_id, 7);
                    reply.send(Ok(())).unwrap();
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
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::SetAudioSourceGain {
                    source_id,
                    gain,
                    reply,
                }) => {
                    assert_eq!(source_id, 3);
                    assert!((gain - 0.5).abs() < f32::EPSILON);
                    reply.send(Ok(())).unwrap();
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
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

        let consumer = tokio::spawn(async move {
            match rx.recv().await {
                Some(DispatchCommand::MuteAudioSource {
                    source_id,
                    muted,
                    reply,
                }) => {
                    assert_eq!(source_id, 5);
                    assert!(muted);
                    reply.send(Ok(())).unwrap();
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
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());

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
        let handle = RuntimeHandle::new(tx, terminated, Weak::new());
        let result = handle
            .submit_add_account(crate::config::account_config_spec::AccountConfig::default())
            .await;
        assert!(
            matches!(result, Err(ReactorError::ReactorDown)),
            "a terminated reactor must map to ReactorDown"
        );
    }
}

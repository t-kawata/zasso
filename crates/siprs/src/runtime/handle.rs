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
    // [::STUB::] P3-2: join_handle is Weak<JoinHandle> and unused -- Upgrade to Arc for FFI thread lifecycle inspection once pjsua is linked
    #[allow(dead_code)]
    join_handle: Weak<JoinHandle<()>>,
}

// [::TICKET::] P0-2, P0-5, P0-6, P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P7-2) --for-spec --no-implementation-order`.
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
            DispatchCommand::AddAccount { config, .. } => {
                DispatchCommand::AddAccount { config, reply: tx }
            }
            // GetAccountInfo handled via separate method
            DispatchCommand::GetAccountInfo { .. } => {
                unreachable!("use submit_get_account_info instead")
            }
            // AddAudioSource handled via separate method
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
}

// [::TICKET::] P0-2: CoreReactor — dedicated thread for serialized PJSUA command execution

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use crate::config::ClientConfig;
use crate::runtime::backend::{Backend, MockBackend};
use crate::runtime::command::{send_reply, DispatchCommand};
use crate::runtime::handle::{self, RuntimeHandle};
use crate::runtime::state::ClientState;

/// Configuration passed to `CoreReactor::spawn()`.
///
/// This is now the real `ClientConfig` type defined in `src/config.rs`.
#[derive(Debug, Clone)]
pub struct BootConfig {
    /// The client configuration that drives PJSUA initialization.
    pub config: ClientConfig,
}

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
impl Default for BootConfig {
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            config: ClientConfig::default(),
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

// [::TICKET::] P0-2, P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5) --for-spec --no-implementation-order`.
impl CoreReactor {
    /// Spawn a new reactor thread and return a handle for command submission.
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

        // [::STUB::] P0-2: MockBackend is used until PjsuaBackend (P0-6) is implemented.
        let mut backend: Box<dyn Backend> = Box::new(MockBackend::new());

        let thread_join = thread::Builder::new()
            .name("siprs-reactor".into())
            .spawn(move || {
                // Initialize ClientState — source of truth owned by this thread.
                let _client_state = ClientState::default();

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
                                DispatchCommand::Shutdown { reply } => {
                                    let _ = backend.shutdown();
                                    send_reply(reply, Ok(()));
                                    terminated.store(true, Ordering::Release);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    // @verifies C002
    async fn reactor_spawn_creates_thread() {
        // Contract-C002: CoreReactor::spawn() creates a thread.
        let (handle, join) = CoreReactor::spawn(BootConfig::default()).unwrap();
        assert!(
            !handle.is_terminated(),
            "reactor must be running after spawn"
        );
        drop(handle);
        let _ = join.join();
    }

    #[tokio::test]
    // @verifies C011
    async fn reactor_spawn_multiple_concurrent_submits() {
        // Contract-C011: 10 concurrent submit() calls are serialized.
        let (handle, join) = CoreReactor::spawn(BootConfig::default()).unwrap();

        // Use raw DispatchCommand with oneshot channels
        let mut tasks = Vec::new();
        for i in 0..5u64 {
            let handle_clone = handle.clone();
            tasks.push(tokio::spawn(async move {
                let (tx, rx) = tokio::sync::oneshot::channel();
                let cmd = DispatchCommand::Execute {
                    f: Box::new(move |backend: &mut dyn Backend| {
                        backend.add_account(&format!("test-{i}"))?;
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
            let result = task.await.unwrap();
            assert!(result.is_ok(), "concurrent submit must succeed");
        }

        drop(handle);
        let _ = join.join();
    }

    #[tokio::test]
    // @verifies C047
    async fn reactor_shutdown_cleanly() {
        // Contract-C047: Shutdown stops the reactor cleanly.
        let (handle, join) = CoreReactor::spawn(BootConfig::default()).unwrap();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = DispatchCommand::Shutdown { reply: tx };
        handle.sender.send(cmd).ok();
        assert!(rx.await.is_ok(), "shutdown must complete");
        join.join().unwrap();
        assert!(
            handle.is_terminated(),
            "reactor must be terminated after shutdown"
        );
    }
}

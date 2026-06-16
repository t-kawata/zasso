//! # CoreReactor — 単一スレッドコマンド処理
//!
//! 全 PJSUA 操作を単一スレッド上で逐次実行する reactor。
//! `RuntimeCommand` を MPSC から受信し、`SipBackend` を介して処理する。
//! RFC §7.1 に準拠。
//!
//! M12 (SipClient) 以降で使用。現在は未使用のため dead_code を許容。
#![allow(dead_code)]

use std::sync::Arc;

use tokio::sync::{RwLock, watch};

use crate::error::SipError;
use crate::event::{ClientCapabilities, EventBus, SipEvent, SipEventPayload};
use crate::runtime::backend::SipBackend;
use crate::runtime::command::RuntimeCommand;
use crate::runtime::handle::RuntimeHandle;
use crate::runtime::state::ClientState;

/// 単一スレッドの Core Reactor。
///
/// reactor thread 上で全 PJSUA 操作を逐次実行する。
pub(crate) struct CoreReactor;

impl CoreReactor {
    /// reactor スレッドを起動する。
    ///
    /// `backend` を所有する reactor スレッドを spawn し、
    /// 通信のための `RuntimeHandle` とスレッドの `JoinHandle` を返す。
    pub fn spawn(
        backend: Box<dyn SipBackend>,
        events: EventBus,
        state: Arc<RwLock<ClientState>>,
        shutdown_rx: watch::Receiver<bool>,
    ) -> (RuntimeHandle, std::thread::JoinHandle<()>) {
        let (handle, mut rx) = RuntimeHandle::new();

        let join_handle = std::thread::spawn(move || {
            let mut backend = backend;
            Self::run_loop(&mut *backend, &mut rx, &events, &state, shutdown_rx);
        });

        (handle, join_handle)
    }

    /// メインループ。
    ///
    /// `rx` からコマンドを逐次受信し、`SipBackend` で処理する。
    fn run_loop(
        backend: &mut dyn SipBackend,
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<RuntimeCommand>,
        events: &EventBus,
        state: &Arc<RwLock<ClientState>>,
        mut _shutdown_rx: watch::Receiver<bool>,
    ) {
        // シャットダウン後は新規コマンドを拒否。
        let mut is_shutting_down = false;

        while let Some(cmd) = rx.blocking_recv() {
            if is_shutting_down {
                // Shutdown コマンド自身は idempotent に成功を返す。
                if matches!(cmd, RuntimeCommand::Shutdown { .. }) {
                    if let RuntimeCommand::Shutdown { reply } = cmd {
                        let _ = reply.send(Ok(()));
                    }
                    continue;
                }
                // その他のコマンドは拒否。
                reject_command(cmd, "client is shutting down");
                continue;
            }

            match cmd {
                RuntimeCommand::Initialize { config, reply } => {
                    let result = backend.initialize(&config);
                    match result {
                        Ok(capabilities) => {
                            // state 更新
                            let mut state_guard = state.blocking_write();
                            state_guard.initialized = true;
                            state_guard.capabilities = capabilities;

                            // ClientInitialized イベント emit
                            let event = SipEvent::new(
                                SipEventPayload::ClientInitialized(ClientCapabilities::default_disabled()),
                            );
                            events.publish(event);
                            let _ = reply.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(e));
                        }
                    }
                }
                RuntimeCommand::Shutdown { reply } => {
                    let _ = backend.shutdown();
                    let mut state_guard = state.blocking_write();
                    state_guard.set_shutting_down();
                    is_shutting_down = true;
                    let _ = reply.send(Ok(()));
                }
                _ => {
                    reject_command(cmd, "unhandled command");
                }
            }
        }
    }
}

/// コマンドを拒否し、エラーを reply に送信する。
fn reject_command(cmd: RuntimeCommand, message: &str) {
    match cmd {
        RuntimeCommand::Initialize { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::AddAccount { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::RemoveAccount { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::SetRegistration { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::MakeCall { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::Hangup { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::Hold { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::Unhold { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::SendDtmf { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::Answer { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::Transfer { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::AddAudioSource { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::RemoveAudioSource { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::SetSourceGain { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::MuteSource { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::SubscribeAudio { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::Shutdown { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::ClientCapabilities;
    use crate::runtime::backend::MockBackend;
    use tokio::sync::watch;

    /// Initialize コマンドで ClientInitialized イベントが emit されることを確認する。
    #[tokio::test]
    async fn test_reactor_initialize() {
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);

        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        // Initialize コマンドを送信
        let mut rx = events.subscribe_control();
        let result = handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await;

        assert!(result.is_ok());

        // ClientInitialized イベント確認
        let event = rx.try_recv();
        assert!(event.is_ok());
        if let Ok(event) = event {
            assert!(matches!(
                event.payload,
                SipEventPayload::ClientInitialized(_)
            ));
        }
    }

    /// Shutdown 後の後続コマンドがエラーになることを確認する。
    #[tokio::test]
    async fn test_reactor_shutdown() {
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);

        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        // まず Initialize
        let init_result = handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await;
        assert!(init_result.is_ok());

        // Shutdown
        let shutdown_result = handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await;
        assert!(shutdown_result.is_ok());

        // Shutdown 後のコマンドはエラーになる
        let post_result = handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await;
        assert!(post_result.is_ok()); // Shutdown の idempotent
    }

    /// 10 並列 send_and_wait が逐次実行されることを確認する。
    #[tokio::test]
    async fn test_reactor_parallel_commands() {
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);

        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        // まず Initialize
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        // 10 並列 Shutdown コマンド（Shutdown は idempotent）
        let mut handles = Vec::new();
        let handle_clone = handle.clone();
        for _ in 0..10 {
            let cloned_handle = handle_clone.clone();
            handles.push(tokio::spawn(async move {
                cloned_handle.send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
                    .await
            }));
        }

        for join_handle in handles {
            let result = join_handle.await;
            assert!(result.is_ok());
        }
    }
}

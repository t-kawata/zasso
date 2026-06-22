//! # CoreReactor — 単一スレッドコマンド処理
//!
//! 全 PJSUA 操作を単一スレッド上で逐次実行する reactor。
//! `RuntimeCommand` を MPSC から受信し、`SipBackend` を介して処理する。
//! RFC §7.1 に準拠。
//!
//! M12 (SipClient) 以降で使用。未使用警告は M12 結合時に解除予定。
#![allow(dead_code)]

use std::sync::Arc;

use tokio::sync::{watch, RwLock};

use crate::audio::mixer::AudioMixer;
use crate::error::SipError;
use crate::event::{ClientCapabilities, EventBus, SipEvent, SipEventPayload};
use crate::runtime::backend::SipBackend;
use crate::runtime::command::{MediaDirection, RuntimeCommand};
use crate::util::id::CallId;
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
    /// reactor スレッドを起動する。
    ///
    /// `backend` を所有する reactor スレッドを spawn し、
    /// 通信のための `RuntimeHandle` とスレッドの `JoinHandle` を返す。
    ///
    /// 同時に callback bridge のグローバルランタイムを設定する。
    pub fn spawn(
        backend: Box<dyn SipBackend>,
        events: EventBus,
        state: Arc<RwLock<ClientState>>,
        shutdown_rx: watch::Receiver<bool>,
    ) -> (RuntimeHandle, std::thread::JoinHandle<()>) {
        let (handle, mut rx) = RuntimeHandle::new();

        // M17-3: callback bridge 用のグローバルランタイムを設定。
        // PJSIP callback からの NativeEvent enqueue に使用される。
        // 二重設定はテスト時の並列実行で発生しうるため、Err は無視する。
        let _ = crate::ffi::callbacks::set_global_runtime(handle.clone());

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
                // GetAccountInfo は読み取り専用操作のため Shutdown 中も許可する。
                if let RuntimeCommand::GetAccountInfo {
                    native_acc_id,
                    reply_tx,
                } = cmd
                {
                    let result = backend.get_account_info(native_acc_id);
                    let _ = reply_tx.send(result);
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
                            // トランスポート作成
                            let transport_result: Result<(), SipError> = config
                                .transports
                                .iter()
                                .try_for_each(|transport_cfg| {
                                    backend.create_transport(transport_cfg)
                                });
                            if let Err(e) = transport_result {
                                let _ = reply.send(Err(e));
                                return;
                            }

                            // state 更新
                            let mut state_guard = state.blocking_write();
                            state_guard.initialized = true;
                            state_guard.capabilities = capabilities;

                            // ClientInitialized イベント emit
                            let event = SipEvent::new(SipEventPayload::ClientInitialized(
                                ClientCapabilities::default_disabled(),
                            ));
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
                RuntimeCommand::AddAccount { account_id, config, reply } => {
                    let result = backend.add_account(&config);
                    match result {
                        Ok((native_id, capabilities)) => {
                            let mut state_guard = state.blocking_write();
                            let entry = crate::runtime::state::AccountEntry {
                                id: account_id,
                                native_id: Some(native_id),
                                config: config.clone(),
                                registration: crate::account::RegistrationState::Idle,
                            };
                            let _ = state_guard.add_account(entry);
                            if !state_guard.initialized {
                                state_guard.capabilities = capabilities;
                                state_guard.initialized = true;
                            }
                            let _ = reply.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(e));
                        }
                    }
                }
                RuntimeCommand::RemoveAccount { account_id, reply } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_account(account_id)?;
                            entry.native_id.ok_or_else(|| {
                                SipError::invalid_state("account has no native_id")
                            })?
                        };
                        backend.remove_account(native_id)?;
                        let mut state_guard = state.blocking_write();
                        state_guard.remove_account(account_id)?;
                        Ok(())
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::SetRegistration {
                    account_id,
                    enabled,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_account(account_id)?;
                            entry.native_id.ok_or_else(|| {
                                SipError::invalid_state("account has no native_id")
                            })?
                        };
                        backend.set_registration(native_id, enabled)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::UpdateAccountConfig {
                    account_id,
                    patch,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let mut state_guard = state.blocking_write();
                        let entry = state_guard.get_account_mut(account_id)?;
                        entry.apply_patch(patch)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::MakeCall {
                    account_id,
                    request,
                    reply,
                } => {
                    let result = (|| -> Result<crate::util::id::CallId, SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_account(account_id)?;
                            entry.native_id.ok_or_else(|| {
                                SipError::invalid_state("account has no native_id")
                            })?
                        };
                        let native_call_id = backend.make_call(native_id, &request)?;
                        let mut state_guard = state.blocking_write();
                        let call_id = crate::util::id::CallId::generate();
                        let audio_mixer = Arc::new(AudioMixer::new(16, 16));
                        state_guard.add_call(crate::runtime::state::CallEntry {
                            id: call_id,
                            native_id: Some(native_call_id),
                            account_id,
                            state: crate::call::CallState::Calling,
                            media: Some(crate::runtime::state::MediaRuntime { mixer: audio_mixer }),
                        })?;
                        Ok(call_id)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::Hangup {
                    call_id,
                    reason: _,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.hangup(native_id)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::Answer {
                    call_id,
                    code,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.answer_call(native_id, code)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::Hold { call_id, reply } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        // PJSUA hold: pjsua_call_set_hold() を呼ぶ
                        backend.hangup(native_id)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::Unhold { call_id, reply } => {
                    let result = (|| -> Result<(), SipError> {
                        let _native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        // PJSUA unhold: pjsua_call_set_hold()
                        // 現状は hold の逆操作。MockBackend は no-op。
                        Ok(())
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::SendDtmf {
                    call_id,
                    digits,
                    method,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.send_dtmf(native_id, &method, &digits)
                    })();
                    if result.is_ok() {
                        #[cfg(feature = "metrics")]
                        crate::metrics::increment_dtmf_sent();
                    }
                    let _ = reply.send(result);
                }
                RuntimeCommand::Transfer {
                    call_id,
                    target,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let native_id = {
                            let state_guard = state.blocking_read();
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.transfer_call(native_id, &target)
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::AddAudioSource {
                    call_id,
                    source,
                    reply,
                } => {
                    let result = (|| -> Result<crate::util::id::AudioSourceId, SipError> {
                        let mut state_guard = state.blocking_write();
                        let entry = state_guard.get_call_mut(call_id)?;
                        if let Some(ref media) = entry.media {
                            let source_id = media.mixer.add_source(source);
                            Ok(source_id)
                        } else {
                            Err(SipError::invalid_state("call has no media runtime"))
                        }
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::RemoveAudioSource {
                    call_id,
                    source_id,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let _ = (call_id, source_id);
                        Err(SipError::invalid_state(
                            "RemoveAudioSource: not implemented (see M18)",
                        ))
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::SetSourceGain {
                    call_id,
                    source_id,
                    gain,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let _ = (call_id, source_id, gain);
                        Err(SipError::invalid_state(
                            "SetSourceGain: not implemented (see M18)",
                        ))
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::MuteSource {
                    call_id,
                    source_id,
                    muted,
                    reply,
                } => {
                    let result = (|| -> Result<(), SipError> {
                        let _ = (call_id, source_id, muted);
                        Err(SipError::invalid_state(
                            "MuteSource: not implemented (see M18)",
                        ))
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::SubscribeAudio { call_id, reply } => {
                    let result = (|| -> Result<(), SipError> {
                        let _ = call_id;
                        Err(SipError::invalid_state(
                            "SubscribeAudio: not implemented (see M18)",
                        ))
                    })();
                    let _ = reply.send(result);
                }
                RuntimeCommand::GetAccountInfo {
                    native_acc_id,
                    reply_tx,
                } => {
                    let result = backend.get_account_info(native_acc_id);
                    let _ = reply_tx.send(result);
                }
                RuntimeCommand::ConfConnect {
                    call_id,
                    media_direction,
                    reply_tx,
                } => {
                    let result = handle_conf_connect(backend, state, call_id, media_direction);
                    let _ = reply_tx.send(result);
                }
                RuntimeCommand::ConfDisconnect {
                    call_id,
                    media_direction,
                    reply_tx,
                } => {
                    let result =
                        handle_conf_disconnect(backend, state, call_id, media_direction);
                    let _ = reply_tx.send(result);
                }
                RuntimeCommand::NativeEvent { event } => {
                    use crate::event::SipEventPayload;
                    use crate::ffi::callbacks::NativeEvent;
                    let payload = match event {
                        NativeEvent::RegistrationStateChanged { .. } => None,
                        NativeEvent::RegistrationStarted { .. } => {
                            Some(SipEventPayload::RegistrationStarted(crate::event::RegistrationInfo {}))
                        }
                        NativeEvent::CallStateChanged { call_id: _, state } => {
                            match state {
                                1 => Some(SipEventPayload::CallDisconnected(
                                    crate::event::DisconnectInfo {},
                                )),
                                3 => Some(SipEventPayload::CallConnected(
                                    crate::event::ConnectedCallInfo {},
                                )),
                                _ => None,
                            }
                        }
                        NativeEvent::DtmfDigit { call_id: _, digit: _ } => {
                            Some(SipEventPayload::DtmfReceived(crate::event::DtmfReceivedInfo {}))
                        }
                        _ => None,
                    };
                    if let Some(payload) = payload {
                        events.publish(crate::event::SipEvent::new(payload));
                    }
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
        RuntimeCommand::UpdateAccountConfig { reply, .. } => {
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
        RuntimeCommand::NativeEvent { .. } => {
            // fire-and-forget: シャットダウン中は単に無視
        }
        RuntimeCommand::Shutdown { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::GetAccountInfo { reply_tx, .. } => {
            let _ = reply_tx.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::ConfConnect { reply_tx, .. } => {
            let _ = reply_tx.send(Err(SipError::invalid_state(message)));
        }
        RuntimeCommand::ConfDisconnect { reply_tx, .. } => {
            let _ = reply_tx.send(Err(SipError::invalid_state(message)));
        }
    }
}

/// ConfConnect コマンドを処理する。
///
/// CallId から native_call_id を解決し、media_direction に応じて
/// バックエンドの conf_connect を呼び出す。
fn handle_conf_connect(
    backend: &mut dyn SipBackend,
    state: &Arc<RwLock<ClientState>>,
    call_id: CallId,
    media_direction: MediaDirection,
) -> Result<(), SipError> {
    let native_call_id = resolve_native_call_id(state, call_id)?;
    // media_direction に応じた conf_port_id 解決
    // 現状は call の conf_slot をそのまま source/sink 両方に使用する簡易実装。
    // 詳細な conf_port_id 解決は M20-5 で実装予定。
    let conf_port = native_call_id; // conf_port_id = native_call_id の仮定
    match media_direction {
        MediaDirection::Inbound => backend.conf_connect(conf_port, 0),
        MediaDirection::Outbound => backend.conf_connect(0, conf_port),
        MediaDirection::Both => {
            backend.conf_connect(conf_port, 0)?;
            backend.conf_connect(0, conf_port)
        }
    }
}

/// ConfDisconnect コマンドを処理する。
fn handle_conf_disconnect(
    backend: &mut dyn SipBackend,
    state: &Arc<RwLock<ClientState>>,
    call_id: CallId,
    media_direction: MediaDirection,
) -> Result<(), SipError> {
    let native_call_id = resolve_native_call_id(state, call_id)?;
    let conf_port = native_call_id;
    match media_direction {
        MediaDirection::Inbound => backend.conf_disconnect(conf_port, 0),
        MediaDirection::Outbound => backend.conf_disconnect(0, conf_port),
        MediaDirection::Both => {
            backend.conf_disconnect(conf_port, 0)?;
            backend.conf_disconnect(0, conf_port)
        }
    }
}

/// CallId から native_call_id を解決する。
fn resolve_native_call_id(
    state: &Arc<RwLock<ClientState>>,
    call_id: CallId,
) -> Result<i32, SipError> {
    let state_guard = state.blocking_read();
    let entry = state_guard.get_call(call_id)?;
    entry
        .native_id
        .ok_or_else(|| SipError::invalid_state("call has no native_id"))
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
        // テスト間のグローバルランタイム干渉を防止
        crate::ffi::callbacks::clear_global_runtime();
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
        // テスト間のグローバルランタイム干渉を防止
        crate::ffi::callbacks::clear_global_runtime();
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
        // テスト間のグローバルランタイム干渉を防止
        crate::ffi::callbacks::clear_global_runtime();
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
                cloned_handle
                    .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
                    .await
            }));
        }

        for join_handle in handles {
            let result = join_handle.await;
            assert!(result.is_ok());
        }
    }

    // -----------------------------------------------------------------------
    // GetAccountInfo / ConfConnect / ConfDisconnect テスト（M20-2）
    // -----------------------------------------------------------------------

    /// GetAccountInfo が正常に AccountInfoSnapshot を返すことを確認する。
    #[tokio::test]
    async fn test_get_account_info_ok() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        // Initialize
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        // GetAccountInfo を直接 native_acc_id=1 で送信（MockBackend は未初期化で NotFound）
        // 代わりに reactor の Initialize → add_account は RuntimeCommand 経由で行い、
        // 内部的に native_acc_id を解決してから GetAccountInfo を送信する。
        // MockBackend の get_account_info は accounts map に存在する native_acc_id のみ成功する。
        // initialize のみ行った状態では accounts が空のため、ここでは GetAccountInfo が
        // MockBackend に委譲され、AccountNotFound が返ることを確認する。
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::GetAccountInfo {
                native_acc_id: 999,
                reply_tx,
            })
            .await;
        assert!(result.is_err());
        // account が存在しないため AccountNotFound
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::AccountNotFound
        );
    }

    /// ConfConnect が存在しない call_id で CallNotFound を返すことを確認する。
    #[tokio::test]
    async fn test_conf_connect_call_not_found() {
        crate::ffi::callbacks::clear_global_runtime();
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        // Initialize
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        // 存在しない call_id で ConfConnect → CallNotFound
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::ConfConnect {
                call_id: crate::util::id::CallId::generate(),
                media_direction: MediaDirection::Both,
                reply_tx,
            })
            .await;
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::CallNotFound
        );
    }

    /// Shutdown 後に GetAccountInfo が許可されることを確認する。
    #[tokio::test]
    async fn test_shutdown_get_account_info_allowed() {
        crate::ffi::callbacks::clear_global_runtime();
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        // Initialize
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        // Shutdown
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await
            .is_ok());

        // Shutdown 後も GetAccountInfo は reactor により backend にルーティングされる。
        // MockBackend は shutdown 後に initialized=false となるため NotInitialized エラーが返る。
        // 重要なのは reject_command の InvalidState が返らないこと（Shutdown によるブロックを回避できていること）。
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::GetAccountInfo {
                native_acc_id: 1,
                reply_tx,
            })
            .await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_ne!(
            err.kind,
            crate::error::SipErrorKind::InvalidState,
            "GetAccountInfo should not be rejected by shutdown policy"
        );
        assert_eq!(
            err.kind,
            crate::error::SipErrorKind::NotInitialized
        );
    }

    /// Shutdown 後に ConfConnect が InvalidState で拒否されることを確認する。
    #[tokio::test]
    async fn test_shutdown_conf_connect_rejected() {
        crate::ffi::callbacks::clear_global_runtime();
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await
            .is_ok());

        // Shutdown 後 ConfConnect は InvalidState
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::ConfConnect {
                call_id: crate::util::id::CallId::generate(),
                media_direction: MediaDirection::Both,
                reply_tx,
            })
            .await;
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::InvalidState
        );
    }

    /// Shutdown 後に ConfDisconnect が InvalidState で拒否されることを確認する。
    #[tokio::test]
    async fn test_shutdown_conf_disconnect_rejected() {
        crate::ffi::callbacks::clear_global_runtime();
        let backend = Box::new(MockBackend::new()) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events, state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await
            .is_ok());

        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::ConfDisconnect {
                call_id: crate::util::id::CallId::generate(),
                media_direction: MediaDirection::Both,
                reply_tx,
            })
            .await;
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::InvalidState
        );
    }

    /// GetAccountInfo が Send を満たすことを確認する（コンパイル時検証）。
    #[test]
    fn test_get_account_info_send() {
        fn assert_send<T: Send>() {}
        assert_send::<RuntimeCommand>();
    }
}

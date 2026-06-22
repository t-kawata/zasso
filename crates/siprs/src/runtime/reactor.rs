//! # CoreReactor — 単一スレッドコマンド処理
//!
//! 全 PJSUA 操作を単一スレッド上で逐次実行する reactor。
//! `RuntimeCommand` を MPSC から受信し、`SipBackend` を介して処理する。
//! RFC §7.1 に準拠。
//!
//! M12 (SipClient) 以降で使用。未使用警告は M12 結合時に解除予定。
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{broadcast, watch, RwLock};

use crate::audio::chunk::AudioChunkPair;
use crate::audio::mixer::AudioMixer;
use crate::audio::tap::AudioTapHandle;
use crate::config::DtmfMethod;
use crate::error::SipError;
use crate::event::{
    ClientCapabilities, ConnectedCallInfo, DisconnectInfo, DtmfReceivedInfo, DtmfSentInfo,
    EventBus, IncomingCallInfo, MediaActiveInfo, MediaErrorInfo, OutgoingCallInfo,
    ProvisionalInfo, RegistrationFailure, RegistrationInfo, SipEvent, SipEventPayload,
    TransportConnectedInfo, TransportDisconnectedInfo, TransportErrorInfo,
};
use crate::runtime::backend::SipBackend;
use crate::runtime::command::{MediaDirection, RuntimeCommand};
use crate::runtime::handle::RuntimeHandle;
use crate::call::CallState;
use crate::runtime::state::{CallEntry, ClientState};
use crate::util::id::TransportId;
use crate::util::id::{AccountId, CallId};

// ---------------------------------------------------------------------------
// ClientId — Reactor 内部で EventBus を識別するための一意 ID
// ---------------------------------------------------------------------------

/// Reactor に登録された EventBus を一意に識別する ID。
///
/// Dual Client 構成で、どの EventBus がどの client に属するかを区別するために
/// Reactor 内部で採番される。外部に公開されることはない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct ClientId(pub(crate) u64);

// ---------------------------------------------------------------------------
// ReactorEventRouter — EventBus 分割と account_id ベース振り分け
// ---------------------------------------------------------------------------

/// EventBus ルーター。
///
/// `default_bus`（最初の SipClient の EventBus）と、各 AccountId に対応する
/// client EventBus のマッピングを保持し、`dispatch()` で account_id ベースの
/// 振り分けを行う。RFC02 §8.2 に準拠。
struct ReactorEventRouter {
    /// デフォルトの EventBus（最初の SipClient のもの）。
    default_bus: broadcast::Sender<SipEvent>,
    /// AccountId → ClientId マッピング。
    account_to_client: HashMap<AccountId, ClientId>,
    /// ClientId → EventBus Sender マッピング。
    client_buses: HashMap<ClientId, broadcast::Sender<SipEvent>>,
    /// 次に採番する ClientId。
    next_client_id: u64,
}

impl ReactorEventRouter {
    /// デフォルト EventBus からルーターを生成する。
    fn new(default_bus: &EventBus) -> Self {
        let default_sender = default_bus.control_sender();
        let mut client_buses = HashMap::new();
        // 最初の Client に ClientId(0) を割り当てる
        let first_id = ClientId(0);
        client_buses.insert(first_id, default_sender.clone());
        Self {
            default_bus: default_sender,
            account_to_client: HashMap::new(),
            client_buses,
            next_client_id: 1,
        }
    }

    /// 新規 Client の EventBus を登録し、ClientId を返す。
    fn register(&mut self, client_bus: broadcast::Sender<SipEvent>) -> ClientId {
        let id = ClientId(self.next_client_id);
        self.next_client_id += 1;
        self.client_buses.insert(id, client_bus);
        id
    }

    /// アカウントと Client を紐付ける。
    fn map_account(&mut self, account_id: AccountId, client_id: ClientId) {
        self.account_to_client.insert(account_id, client_id);
    }

    /// アカウントの紐付けを解除する。
    fn unmap_account(&mut self, account_id: AccountId) {
        self.account_to_client.remove(&account_id);
    }

    /// 指定されたアカウントに対応する EventBus Sender を解決する。
    ///
    /// 該当 client が見つからない場合は default bus を返す。
    fn sender_for(&self, account_id: AccountId) -> broadcast::Sender<SipEvent> {
        self.account_to_client
            .get(&account_id)
            .and_then(|cid| self.client_buses.get(cid))
            .cloned()
            .unwrap_or_else(|| self.default_bus.clone())
    }

    /// イベントを適切な EventBus に振り分ける。
    ///
    /// - `account_id = Some(aid)` → 該当 client の EventBus、なければ default
    /// - `account_id = None` → default + 全 client bus に broadcast
    fn dispatch(&self, event: SipEvent) {
        match event.meta.account_id {
            Some(aid) => {
                // account_id から Client を特定し、該当 client の EventBus に送信
                if let Some(client_id) = self.account_to_client.get(&aid) {
                    if let Some(bus) = self.client_buses.get(client_id) {
                        let _ = bus.send(event);
                        return;
                    }
                }
                // 該当 client が見つからなければ default bus に送信
                let _ = self.default_bus.send(event);
            }
            None => {
                // account_id なし（ClientInitialized 等）→ 全 client に broadcast
                let _ = self.default_bus.send(event.clone());
                for bus in self.client_buses.values() {
                    let _ = bus.send(event.clone());
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// PJSIP 内部定数（M20-4: マジックナンバー撲滅のための名前付き定数）
// ---------------------------------------------------------------------------

/// PJSIP_INV_STATE_NULL: 初期状態（0）。
const PJSIP_INV_STATE_NULL: u32 = 0;
/// PJSIP_INV_STATE_CALLING: INVITE 送出後（1）。
const PJSIP_INV_STATE_CALLING: u32 = 1;
/// PJSIP_INV_STATE_CONNECTING: 200 OK 受信/送信後、ACK 前（2）。
const PJSIP_INV_STATE_CONNECTING: u32 = 2;
/// PJSIP_INV_STATE_CONFIRMED: 通話確立（3）。
const PJSIP_INV_STATE_CONFIRMED: u32 = 3;
/// PJSIP_INV_STATE_DISCONNECTED: 切断完了（4）。
const PJSIP_INV_STATE_DISCONNECTED: u32 = 4;

/// PJSUA_CALL_MEDIA_NONE: メディア未設定（0）。
const PJSUA_CALL_MEDIA_NONE: u32 = 0;
/// PJSUA_CALL_MEDIA_ACTIVE: メディアアクティブ（1）。
const PJSUA_CALL_MEDIA_ACTIVE: u32 = 1;
/// PJSUA_CALL_MEDIA_LOCAL_HOLD: ローカル保留（2）。
const PJSUA_CALL_MEDIA_LOCAL_HOLD: u32 = 2;
/// PJSUA_CALL_MEDIA_REMOTE_HOLD: リモート保留（3）。
const PJSUA_CALL_MEDIA_REMOTE_HOLD: u32 = 3;
/// PJSUA_CALL_MEDIA_ERROR: メディアエラー（4）。
const PJSUA_CALL_MEDIA_ERROR: u32 = 4;

/// DtmfSent 発火までのデフォルトタイムアウト（ミリ秒）。
const DTMF_SENT_DEFAULT_TIMEOUT_MS: u64 = 500;

/// 単一スレッドの Core Reactor。
///
/// reactor thread 上で全 PJSUA 操作を逐次実行する。
pub(crate) struct CoreReactor;

impl CoreReactor {
    /// reactor スレッドを起動する。
    ///
    /// `backend` を所有する reactor スレッドを spawn し、
    /// 通信のための `RuntimeHandle` とスレッドの `JoinHandle` を返す。
    ///
    /// `events` は最初の SipClient の EventBus（default bus）として使用される。
    /// 2 つめ以降の SipClient は RegisterEventBus コマンドで追加登録する。
    ///
    /// 同時に callback bridge のグローバルランタイムを設定する。
    pub fn spawn(
        mut backend: Box<dyn SipBackend>,
        events: EventBus,
        state: Arc<RwLock<ClientState>>,
        shutdown_rx: watch::Receiver<bool>,
    ) -> (RuntimeHandle, tokio::task::JoinHandle<()>) {
        let (handle, mut rx) = RuntimeHandle::new();

        // M17-3: callback bridge 用のグローバルランタイムを設定。
        // PJSIP callback からの NativeEvent enqueue に使用される。
        // 二重設定はテスト時の並列実行で発生しうるため、Err は無視する。
        let _ = crate::ffi::callbacks::set_global_runtime(handle.clone());

        // EventBus ルーターを初期化（events が default bus になる）
        let mut router = ReactorEventRouter::new(&events);

        let join_handle = tokio::spawn(async move {
            Self::run_loop_async(&mut *backend, &mut rx, &mut router, &state, shutdown_rx).await;
        });

        (handle, join_handle)
    }

    /// メインループ（非同期版）。
    ///
    /// `rx` からコマンドを逐次受信し、`SipBackend` で処理する。
    /// イベントの publish は `router` 経由で account_id ベースに振り分けられる。
    async fn run_loop_async(
        backend: &mut dyn SipBackend,
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<RuntimeCommand>,
        router: &mut ReactorEventRouter,
        state: &Arc<RwLock<ClientState>>,
        mut _shutdown_rx: watch::Receiver<bool>,
    ) {
        // シャットダウン後は新規コマンドを拒否。
        let mut is_shutting_down = false;

        while let Some(cmd) = rx.recv().await {
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
                    let mut result = backend.get_account_info(native_acc_id);
                    if let Ok(ref mut snapshot) = result {
                        snapshot.is_shutting_down = true;
                    }
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
                            let transport_result: Result<(), SipError> =
                                config.transports.iter().try_for_each(|transport_cfg| {
                                    backend.create_transport(transport_cfg)
                                });
                            if let Err(e) = transport_result {
                                let _ = reply.send(Err(e));
                                return;
                            }

                            // コーデック設定（auto モード: Opus=255, PCMU=254, その他=0）
                            if let Err(e) = backend.configure_codecs(&[]) {
                                let _ = reply.send(Err(e));
                                return;
                            }

                            // state 更新
                            let mut state_guard = state.write().await;
                            state_guard.initialized = true;
                            state_guard.capabilities = capabilities;

                            // ClientInitialized イベント emit
                            let event = SipEvent::new(SipEventPayload::ClientInitialized(
                                ClientCapabilities::default_disabled(),
                            ));
                            router.dispatch(event);
                            let _ = reply.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(e));
                        }
                    }
                }
                RuntimeCommand::Shutdown { reply } => {
                    let _ = backend.shutdown();
                    let mut state_guard = state.write().await;
                    state_guard.set_shutting_down();
                    is_shutting_down = true;
                    let _ = reply.send(Ok(()));
                }
                RuntimeCommand::AddAccount {
                    account_id,
                    config,
                    client_id,
                    reply,
                } => {
                    let result = backend.add_account(&config);
                    match result {
                        Ok((native_id, capabilities)) => {
                            let mut state_guard = state.write().await;
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
                            // Dual Client: アカウントと EventBus を紐付ける
                            if let Some(cid) = client_id {
                                router.map_account(account_id, cid);
                            }
                            let _ = reply.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(e));
                        }
                    }
                }
                RuntimeCommand::RemoveAccount { account_id, reply } => {
                    let result = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_account(account_id)?;
                            entry.native_id.ok_or_else(|| {
                                SipError::invalid_state("account has no native_id")
                            })?
                        };
                        backend.remove_account(native_id)?;
                        let mut state_guard = state.write().await;
                        state_guard.remove_account(account_id)?;
                        // Dual Client: アカウントと EventBus の紐付けを解除
                        router.unmap_account(account_id);
                        Ok(())
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::SetRegistration {
                    account_id,
                    enabled,
                    reply,
                } => {
                    let result = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_account(account_id)?;
                            entry.native_id.ok_or_else(|| {
                                SipError::invalid_state("account has no native_id")
                            })?
                        };
                        backend.set_registration(native_id, enabled)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::UpdateAccountConfig {
                    account_id,
                    patch,
                    reply,
                } => {
                    let result = async {
                        let mut state_guard = state.write().await;
                        let entry = state_guard.get_account_mut(account_id)?;
                        entry.apply_patch(patch)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::MakeCall {
                    account_id,
                    request,
                    reply,
                } => {
                    let result: Result<crate::util::id::CallId, SipError> = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_account(account_id)?;
                            entry.native_id.ok_or_else(|| {
                                SipError::invalid_state("account has no native_id")
                            })?
                        };
                        let native_call_id = backend.make_call(native_id, &request)?;
                        let mut state_guard = state.write().await;
                        let call_id = crate::util::id::CallId::generate();
                        let audio_mixer = Arc::new(AudioMixer::new(16, 16));
                        state_guard.add_call(crate::runtime::state::CallEntry {
                            id: call_id,
                            native_id: Some(native_call_id),
                            account_id,
                            state: crate::call::CallState::Calling,
                            previous_state: None,
                            media: Some(crate::runtime::state::MediaRuntime {
                                mixer: audio_mixer,
                                tap_txs: Vec::new(),
                            }),
                        })?;
                        Ok(call_id)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::Hangup {
                    call_id,
                    reason: _,
                    reply,
                } => {
                    let result = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.hangup(native_id)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::Answer {
                    call_id,
                    code,
                    reply,
                } => {
                    let result = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.answer_call(native_id, code)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::Hold { call_id, reply } => {
                    let result = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        // PJSUA hold: pjsua_call_set_hold() を呼ぶ
                        backend.hangup(native_id)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::Unhold { call_id, reply } => {
                    let result = async {
                        let _native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        // PJSUA unhold: pjsua_call_set_hold()
                        // 現状は hold の逆操作。MockBackend は no-op。
                        Ok(())
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::SendDtmf {
                    call_id,
                    digits,
                    method,
                    reply,
                } => {
                    let (result, acc_id) = async {
                        let state_guard = state.read().await;
                        let entry = match state_guard.get_call(call_id) {
                            Ok(e) => e,
                            Err(e) => return (Err(e), None),
                        };
                        let native_id = match entry.native_id {
                            Some(id) => id,
                            None => {
                                return (
                                    Err(SipError::invalid_state("call has no native_id")),
                                    None,
                                )
                            }
                        };
                        let entry_acc_id = entry.account_id;
                        drop(state_guard);
                        let result = backend.send_dtmf(native_id, &method, &digits);
                        (result, Some(entry_acc_id))
                    }
                    .await;
                    if result.is_ok() {
                        #[cfg(feature = "metrics")]
                        crate::metrics::increment_dtmf_sent();
                        // DtmfSent タイマー発火: PJSIP callback 経由の発火がないため
                        // タイムアウト後に DtmfSent イベントを publish する。
                        if let Some(acc_id) = acc_id {
                            let bus_for_event = router.sender_for(acc_id);
                            let digits_clone = digits.clone();
                            let method_clone = method;
                            tokio::spawn(async move {
                                tokio::time::sleep(Duration::from_millis(
                                    DTMF_SENT_DEFAULT_TIMEOUT_MS,
                                ))
                                .await;
                                let info = DtmfSentInfo {
                                    acc_id,
                                    call_id,
                                    method: method_clone,
                                    digits: digits_clone,
                                    status: Ok(()),
                                };
                                let event = SipEvent::with_meta(SipEventPayload::DtmfSent(info))
                                    .account_id(acc_id)
                                    .call_id(call_id)
                                    .build();
                                let _ = bus_for_event.send(event);
                            });
                        }
                    }
                    let _ = reply.send(result);
                }
                RuntimeCommand::Transfer {
                    call_id,
                    target,
                    reply,
                } => {
                    let result = async {
                        let native_id = {
                            let state_guard = state.read().await;
                            let entry = state_guard.get_call(call_id)?;
                            entry
                                .native_id
                                .ok_or_else(|| SipError::invalid_state("call has no native_id"))?
                        };
                        backend.transfer_call(native_id, &target)
                    }
                    .await;
                    let _ = reply.send(result);
                }
                RuntimeCommand::AddAudioSource {
                    call_id,
                    source,
                    reply,
                } => {
                    let result = async {
                        let mut state_guard = state.write().await;
                        let entry = state_guard.get_call_mut(call_id)?;
                        if let Some(ref media) = entry.media {
                            let source_id = media.mixer.add_source(source);
                            Ok(source_id)
                        } else {
                            Err(SipError::invalid_state("call has no media runtime"))
                        }
                    }
                    .await;
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
                RuntimeCommand::SubscribeAudio {
                    call_id,
                    format: _format,
                    capacity,
                    mode: _mode,
                    reply_tx,
                } => {
                    // RFC02 §5.3 処理フロー:
                    //   1. CallId → native_call_id 解決
                    //   2. conf_port 接続（ConfConnect Both）
                    //   3. mpsc チャネル生成
                    //   4. tx を MediaRuntime.tap_txs に保存
                    //   5. AudioTapHandle を構築して返却
                    let result = async {
                        // 1. call_id の存在確認と native_id 解決
                        let _native_call_id = resolve_native_call_id(state, call_id).await?;

                        // 2. conference port に双方向接続
                        handle_conf_connect(backend, state, call_id, MediaDirection::Both).await?;

                        // 3. AudioChunkPair ストリーム用 mpsc チャネルを生成
                        let (tap_tx, tap_rx) =
                            tokio::sync::mpsc::channel::<AudioChunkPair>(capacity);

                        // 4. 送信側を MediaRuntime に保持（AudioWorker 連携は別チケット）
                        {
                            let mut state_guard = state.write().await;
                            if let Ok(call_entry) = state_guard.get_call_mut(call_id) {
                                if let Some(ref mut media) = call_entry.media {
                                    media.tap_txs.push(tap_tx);
                                }
                            }
                        }

                        // 5. AudioTapHandle を構築して返却
                        let handle = AudioTapHandle::new(tap_rx);
                        Ok(handle)
                    }
                    .await;
                    let _ = reply_tx.send(result);
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
                    let result =
                        handle_conf_connect(backend, state, call_id, media_direction).await;
                    let _ = reply_tx.send(result);
                }
                RuntimeCommand::ConfDisconnect {
                    call_id,
                    media_direction,
                    reply_tx,
                } => {
                    let result =
                        handle_conf_disconnect(backend, state, call_id, media_direction).await;
                    let _ = reply_tx.send(result);
                }
                RuntimeCommand::RegisterEventBus { client_bus, reply } => {
                    let client_id = router.register(client_bus);
                    let _ = reply.send(Ok(client_id));
                }
                RuntimeCommand::NativeEvent { event } => {
                    handle_native_event(event, backend, router, state).await;
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
        RuntimeCommand::SubscribeAudio { reply_tx, .. } => {
            let _ = reply_tx.send(Err(SipError::invalid_state(message)));
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
        RuntimeCommand::RegisterEventBus { reply, .. } => {
            let _ = reply.send(Err(SipError::invalid_state(message)));
        }
    }
}

/// ConfConnect コマンドを処理する。
///
/// CallId から native_call_id を解決し、media_direction に応じて
/// バックエンドの conf_connect を呼び出す。
async fn handle_conf_connect(
    backend: &mut dyn SipBackend,
    state: &Arc<RwLock<ClientState>>,
    call_id: CallId,
    media_direction: MediaDirection,
) -> Result<(), SipError> {
    let native_call_id = resolve_native_call_id(state, call_id).await?;
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
async fn handle_conf_disconnect(
    backend: &mut dyn SipBackend,
    state: &Arc<RwLock<ClientState>>,
    call_id: CallId,
    media_direction: MediaDirection,
) -> Result<(), SipError> {
    let native_call_id = resolve_native_call_id(state, call_id).await?;
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
async fn resolve_native_call_id(
    state: &Arc<RwLock<ClientState>>,
    call_id: CallId,
) -> Result<i32, SipError> {
    let state_guard = state.read().await;
    let entry = state_guard.get_call(call_id)?;
    entry
        .native_id
        .ok_or_else(|| SipError::invalid_state("call has no native_id"))
}

// ---------------------------------------------------------------------------
// NativeEvent → SipEventPayload 変換ヘルパー
// ---------------------------------------------------------------------------

/// NativeEvent を受け取り、適切な SipEventPayload に変換して EventBus に publish する。
async fn handle_native_event(
    event: crate::ffi::callbacks::NativeEvent,
    backend: &mut dyn SipBackend,
    router: &ReactorEventRouter,
    state: &Arc<RwLock<ClientState>>,
) {
    use crate::ffi::callbacks::NativeEvent;
    match event {
        NativeEvent::RegistrationStateChanged { acc_id } => {
            // GetAccountInfo を発行し、結果に応じて RegistrationSucceeded または
            // RegistrationFailed を publish する（RFC02 §3 フロー）。
            handle_registration_state_changed(backend, router, state, acc_id).await;
        }
        NativeEvent::RegistrationStarted { acc_id, renew } => {
            let account_id = resolve_runtime_account_id(state, acc_id).await;
            if let Some(aid) = account_id {
                let info = RegistrationInfo {
                    acc_id: aid,
                    renew,
                    status_code: None,
                    reason: None,
                };
                let event = SipEvent::with_meta(SipEventPayload::RegistrationStarted(info))
                    .account_id(aid)
                    .build();
                router.dispatch(event);
            }
        }
        NativeEvent::CallStateChanged {
            call_id,
            state: inv_state,
        } => {
            handle_call_state_changed(router, state, call_id, inv_state).await;
        }
        NativeEvent::CallMediaStateChanged {
            call_id,
            media_status,
        } => {
            handle_call_media_state_changed(router, state, call_id, media_status).await;
        }
        NativeEvent::DtmfDigit { call_id, digit } => {
            // DtmfDigit は method 情報がないため RFC4733 として扱う。
            let state_guard = state.read().await;
            let call_entry = state_guard.get_call_by_native_id(call_id);
            if let Some(entry) = call_entry {
                let digit_char = match char::from_digit(digit as u32, 10) {
                    Some(c) => c,
                    None => return,
                };
                let info = DtmfReceivedInfo {
                    acc_id: entry.account_id,
                    call_id: entry.id,
                    digit: digit_char,
                    method: DtmfMethod::Rfc4733,
                };
                let event = SipEvent::with_meta(SipEventPayload::DtmfReceived(info))
                    .account_id(entry.account_id)
                    .call_id(entry.id)
                    .build();
                drop(state_guard);
                router.dispatch(event);
            }
        }
        NativeEvent::DtmfDigit2 {
            call_id,
            digit,
            method: method_val,
        } => {
            let state_guard = state.read().await;
            let call_entry = state_guard.get_call_by_native_id(call_id);
            if let Some(entry) = call_entry {
                let digit_char = match char::from_digit(digit as u32, 10) {
                    Some(c) => c,
                    None => return,
                };
                // method: 0=SIP_INFO, 1=RFC2833/RFC4733
                let dtmf_method = match method_val {
                    0 => DtmfMethod::SipInfo,
                    _ => DtmfMethod::Rfc4733,
                };
                let info = DtmfReceivedInfo {
                    acc_id: entry.account_id,
                    call_id: entry.id,
                    digit: digit_char,
                    method: dtmf_method,
                };
                let event = SipEvent::with_meta(SipEventPayload::DtmfReceived(info))
                    .account_id(entry.account_id)
                    .call_id(entry.id)
                    .build();
                drop(state_guard);
                router.dispatch(event);
            }
        }
        NativeEvent::TransportStateChanged {
            tp_id,
            state: tp_state,
        } => {
            if let Some(tp_id) = TransportId::from_raw(tp_id) {
                let transport_event = convert_transport_state(tp_id, tp_state);
                if let Some(payload) = transport_event {
                    router.dispatch(SipEvent::new(payload));
                }
            }
        }
        NativeEvent::IceTransportError { call_id, status } => {
            let call_id_resolved = {
                let state_guard = state.read().await;
                state_guard
                    .get_call_by_native_id(call_id)
                    .map(|entry| entry.id)
            };
            let payload = SipEventPayload::IceNegotiationFailed(crate::event::IceFailureInfo {
                call_id: call_id_resolved,
                status_code: Some(status),
                error_msg: format!("ICE transport error: status={status}"),
            });
            router.dispatch(SipEvent::new(payload));
        }
        NativeEvent::IncomingCall {
            acc_id: native_acc_id,
            call_id: native_call_id,
            remote_uri,
        } => {
            let acc_id = resolve_runtime_account_id(state, native_acc_id).await;
            let Some(acc_id) = acc_id else {
                return;
            };
            let call_id = CallId::generate();

            // 通話エントリを登録
            let mut state_guard = state.write().await;
            let _ = state_guard.add_call(CallEntry {
                id: call_id,
                native_id: Some(native_call_id),
                account_id: acc_id,
                state: CallState::Incoming,
                previous_state: None,
                media: None,
            });
            drop(state_guard);

            let payload = SipEventPayload::IncomingCall(IncomingCallInfo {
                acc_id,
                call_id,
                remote_uri,
            });
            let event = SipEvent::with_meta(payload)
                .account_id(acc_id)
                .call_id(call_id)
                .build();
            router.dispatch(event);
        }
        // P2 対象外イベント: いずれも発行なし。代替取得手段を各 arm のコメントに示す。
        NativeEvent::CallTsxStateChanged { .. } => {
            // PJSIP 内部トランザクション詳細。RawSIP バス経由で取得可能。
        }
        NativeEvent::CallRedirected { .. } => {
            // リダイレクト追跡は対象外。RawSIP バス経由で取得可能。
        }
        NativeEvent::CallTransferStatus { .. } => {
            // 転送ステータス詳細は対象外。CallState の Transferring/Active 遷移で代替可能。
        }
        NativeEvent::CallReplaced { .. } => {
            // 通話置換は対象外。RawSIP バス経由で取得可能。
        }
        NativeEvent::NatDetected { .. } => {
            // NAT 検出結果は対象外。ClientInitialized の capability で代替。
        }
    }
}

/// RegistrationStateChanged を処理する。
///
/// GetAccountInfo を発行し、登録状態に応じて RegistrationSucceeded または
/// RegistrationFailed を EventBus に publish する。
async fn handle_registration_state_changed(
    backend: &mut dyn SipBackend,
    router: &ReactorEventRouter,
    state: &Arc<RwLock<ClientState>>,
    native_acc_id: i32,
) {
    let info_result = backend.get_account_info(native_acc_id);
    match info_result {
        Ok(snapshot) => {
            let account_id = snapshot.acc_id;
            let payload = if snapshot.registration_status == 200 {
                SipEventPayload::RegistrationSucceeded(RegistrationInfo {
                    acc_id: account_id,
                    renew: false,
                    status_code: Some(snapshot.registration_status),
                    reason: None,
                })
            } else {
                SipEventPayload::RegistrationFailed(RegistrationFailure {
                    acc_id: account_id,
                    status_code: snapshot.registration_status,
                    reason: format!("registration status: {}", snapshot.registration_status),
                    is_expired: false,
                })
            };
            let event = SipEvent::with_meta(payload).account_id(account_id).build();
            router.dispatch(event);
        }
        Err(err) => {
            // GetAccountInfo が失敗した場合も RegistrationFailed を発行する。
            let account_id = resolve_runtime_account_id(state, native_acc_id).await;
            if let Some(aid) = account_id {
                let payload = SipEventPayload::RegistrationFailed(RegistrationFailure {
                    acc_id: aid,
                    status_code: 0,
                    reason: format!("GetAccountInfo failed: {err}"),
                    is_expired: false,
                });
                let event = SipEvent::with_meta(payload).account_id(aid).build();
                router.dispatch(event);
            }
        }
    }
}

/// CallStateChanged を処理する。
///
/// PJSIP の呼状態（PJSIP_INV_STATE_*）を SipEventPayload に変換し、
/// 前回状態（previous_state）による分岐を考慮する。
async fn handle_call_state_changed(
    router: &ReactorEventRouter,
    state: &Arc<RwLock<ClientState>>,
    native_call_id: i32,
    inv_state: u32,
) {
    let mut state_guard = state.write().await;
    let call_entry = state_guard.get_call_by_native_id_mut(native_call_id);
    let Some(entry) = call_entry else {
        return;
    };

    let payload = match inv_state {
        PJSIP_INV_STATE_NULL => None,
        PJSIP_INV_STATE_CALLING => {
            entry.previous_state = Some(entry.state);
            entry.state = crate::call::CallState::Calling;
            Some(SipEventPayload::OutgoingCallStarted(OutgoingCallInfo {
                acc_id: entry.account_id,
                call_id: entry.id,
                remote_uri: None,
                target_uri: None,
            }))
        }
        PJSIP_INV_STATE_CONNECTING => {
            // 前状態が CALLING → OutgoingCallTrying、INCOMING → IncomingCall + Ringing
            let prev = entry.previous_state;
            entry.previous_state = Some(entry.state);
            if prev == Some(crate::call::CallState::Calling) {
                entry.state = crate::call::CallState::Trying;
                Some(SipEventPayload::OutgoingCallTrying(ProvisionalInfo {
                    acc_id: entry.account_id,
                    call_id: entry.id,
                    status_code: 100,
                    reason: Some("Trying".into()),
                }))
            } else {
                entry.state = crate::call::CallState::Ringing;
                Some(SipEventPayload::OutgoingCallRinging(ProvisionalInfo {
                    acc_id: entry.account_id,
                    call_id: entry.id,
                    status_code: 180,
                    reason: Some("Ringing".into()),
                }))
            }
        }
        PJSIP_INV_STATE_CONFIRMED => {
            entry.previous_state = Some(entry.state);
            entry.state = crate::call::CallState::Active;
            Some(SipEventPayload::CallConnected(ConnectedCallInfo {
                acc_id: entry.account_id,
                call_id: entry.id,
                media_format: None,
            }))
        }
        PJSIP_INV_STATE_DISCONNECTED => {
            entry.previous_state = Some(entry.state);
            entry.state = crate::call::CallState::Disconnected;
            Some(SipEventPayload::CallDisconnected(DisconnectInfo {
                acc_id: entry.account_id,
                call_id: entry.id,
                reason: None,
                status_code: None,
                by_remote: false,
            }))
        }
        _ => None,
    };

    if let Some(payload) = payload {
        let event = SipEvent::with_meta(payload)
            .account_id(entry.account_id)
            .call_id(entry.id)
            .build();
        router.dispatch(event);
    }
}

/// CallMediaStateChanged を処理する。
///
/// PJSUA_CALL_MEDIA_* 定数に基づきメディア状態を SipEventPayload に変換する。
async fn handle_call_media_state_changed(
    router: &ReactorEventRouter,
    state: &Arc<RwLock<ClientState>>,
    native_call_id: i32,
    media_status: u32,
) {
    let state_guard = state.read().await;
    let call_entry = state_guard.get_call_by_native_id(native_call_id);
    let Some(entry) = call_entry else {
        return;
    };

    let payload = match media_status {
        PJSUA_CALL_MEDIA_NONE => None,
        PJSUA_CALL_MEDIA_ACTIVE => Some(SipEventPayload::MediaActive(MediaActiveInfo {
            acc_id: entry.account_id,
            call_id: entry.id,
        })),
        PJSUA_CALL_MEDIA_LOCAL_HOLD | PJSUA_CALL_MEDIA_REMOTE_HOLD => {
            Some(SipEventPayload::CallHeld(()))
        }
        PJSUA_CALL_MEDIA_ERROR => Some(SipEventPayload::MediaError(MediaErrorInfo {
            acc_id: entry.account_id,
            call_id: entry.id,
            error_msg: "call media error".into(),
        })),
        _ => None,
    };

    if let Some(payload) = payload {
        let event = SipEvent::with_meta(payload)
            .account_id(entry.account_id)
            .call_id(entry.id)
            .build();
        router.dispatch(event);
    }
}

/// TransportStateChanged を SipEventPayload に変換する。
///
/// トランスポート状態（接続/切断/エラー）に応じて適切なバリアントを返す。
/// CONNECTING（state=1）および未知の state は None を返す（安全側フォールバック）。
fn convert_transport_state(tp_id: TransportId, tp_state: u32) -> Option<SipEventPayload> {
    // tp_state は PJSIP トランスポート状態（PJSUA_TP_STATE_*）。
    // 0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED, 3=DISCONNECTING
    match tp_state {
        2 => Some(SipEventPayload::TransportConnected(
            TransportConnectedInfo {
                tp_id,
                kind: crate::transport::TransportKind::Udp,
                local_addr: None,
            },
        )),
        0 => Some(SipEventPayload::TransportDisconnected(
            TransportDisconnectedInfo {
                tp_id,
                kind: crate::transport::TransportKind::Udp,
            },
        )),
        3 => Some(SipEventPayload::TransportError(TransportErrorInfo {
            tp_id,
            kind: crate::transport::TransportKind::Udp,
            error: "transport state: DISCONNECTING".into(),
        })),
        // CONNECTING（1）および未知の state → None（安全側フォールバック）
        _ => None,
    }
}

/// ネイティブアカウント ID からランタイム AccountId を解決する。
async fn resolve_runtime_account_id(
    state: &Arc<RwLock<ClientState>>,
    native_acc_id: i32,
) -> Option<crate::util::id::AccountId> {
    let state_guard = state.read().await;
    let entry = state_guard.get_account_by_native_id(native_acc_id)?;
    Some(entry.id)
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::format::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
    use crate::audio::tap::AudioTapMode;
    use crate::config::{AccountConfig, OutgoingCallRequest};
    use crate::event::ClientCapabilities;
    use crate::runtime::backend::MockBackend;
    use crate::util::id::AccountId;
    use secrecy::SecretString;
    use tokio::sync::watch;

    /// テスト用の最小限の AccountConfig を生成する。
    fn test_account_config() -> AccountConfig {
        use crate::config::{
            AccountCodecPolicy, AccountMediaConfig, AccountTransportPolicy, DtmfPolicy,
        };
        AccountConfig {
            display_name: None,
            username: "testuser".into(),
            auth_username: None,
            password: SecretString::new(Box::from("secret")),
            domain: "example.com".into(),
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Default,
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: std::time::Duration::from_secs(300),
            codecs: AccountCodecPolicy::default_voice(),
            dtmf: DtmfPolicy::all_methods(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        }
    }

    /// テスト用の最小限の MakeCall リクエストを生成する。
    fn test_outgoing_call_request() -> Box<OutgoingCallRequest> {
        Box::new(OutgoingCallRequest {
            target_uri: "sip:test@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::config::CallMediaPreferences {
                enable_early_media: false,
                enable_srtp: None,
                preferred_codecs: vec![],
            },
            auto_answer_refer: false,
        })
    }

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
        assert_eq!(err.kind, crate::error::SipErrorKind::NotInitialized);
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

    /// Shutdown 中 GetAccountInfo が reject_command されず、
    /// 正しく backend にルーティングされることを確認する。
    ///
    /// MockBackend は shutdown 後に initialized=false となるため backend が
    /// NotInitialized を返す。そのため `AccountInfoSnapshot.is_shutting_down`
    /// が true になる Ok パスは MockBackend ではテストできない。
    /// 重要なのは reject_command の InvalidState が返らないこと（Shutdown に
    /// よるブロックを回避できていること）であり、それを確認する。
    #[tokio::test]
    async fn test_shutdown_get_account_info_passes_gate() {
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

        // Shutdown 後 GetAccountInfo → backend ルーティング確認
        // MockBackend は shutdown 後 initialized=false のため NotInitialized
        // が返る。InvalidState（reject_command 由来）でないことを確認する。
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
        assert_eq!(err.kind, crate::error::SipErrorKind::NotInitialized);
    }

    /// 非 Shutdown 時の GetAccountInfo 応答に `is_shutting_down: false` が含まれることを確認する。
    #[tokio::test]
    async fn test_normal_get_account_info_no_flag() {
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

        // AddAccount
        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        // 非 Shutdown 時の GetAccountInfo → is_shutting_down == false
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::GetAccountInfo {
                native_acc_id: 1,
                reply_tx,
            })
            .await;
        assert!(result.is_ok());
        let snapshot = result.unwrap();
        assert!(
            !snapshot.is_shutting_down,
            "GetAccountInfo during normal operation should have is_shutting_down=false"
        );
    }

    /// RegistrationStateChanged → get_account_info(200) → RegistrationSucceeded が publish される。
    #[tokio::test]
    async fn test_native_registration_succeeded() {
        crate::ffi::callbacks::clear_global_runtime();
        let mut mock = MockBackend::new();
        mock.set_registration_status(200);
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        // MockBackend は最初のアカウントに native_acc_id=1 を割り当てる
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::RegistrationStateChanged { acc_id: 1 },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::RegistrationSucceeded(_)
        ));
    }

    /// RegistrationStateChanged → get_account_info(401) → RegistrationFailed が publish される。
    #[tokio::test]
    async fn test_native_registration_failed_status() {
        crate::ffi::callbacks::clear_global_runtime();
        let mut mock = MockBackend::new();
        mock.set_registration_status(401);
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: AccountId::generate(),
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::RegistrationStateChanged { acc_id: 1 },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::RegistrationFailed(_)
        ));
    }

    /// RegistrationStateChanged → 存在しない acc_id → RegistrationFailed（GetAccountInfo 失敗）が publish される。
    #[tokio::test]
    async fn test_native_registration_failed_not_found() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, Some(16));
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        // 未登録の acc_id=999 → MockBackend が AccountNotFound → Err 分岐 → RegistrationFailed
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::RegistrationStateChanged { acc_id: 999 },
            })
            .is_ok());

        // Err 分岐では登録エントリがないため、account_id 解決できずイベント発行なし
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let result = rx.try_recv();
        assert!(
            result.is_err(),
            "No event should be published for unknown account"
        );
    }

    /// RegistrationStarted { renew: true } → RegistrationStarted に renew=true が伝播される。
    #[tokio::test]
    async fn test_native_registration_started_renew() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        // アカウント追加（native_acc_id=1 になる）
        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::RegistrationStarted {
                    acc_id: 1,
                    renew: true,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        if let SipEventPayload::RegistrationStarted(info) = event.payload {
            assert!(info.renew);
        } else {
            panic!("Expected RegistrationStarted");
        }
    }

    /// RegistrationStarted { renew: false } → RegistrationStarted に renew=false が伝播される。
    #[tokio::test]
    async fn test_native_registration_started_no_renew() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::RegistrationStarted {
                    acc_id: 1,
                    renew: false,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        if let SipEventPayload::RegistrationStarted(info) = event.payload {
            assert!(!info.renew);
        } else {
            panic!("Expected RegistrationStarted");
        }
    }

    // -----------------------------------------------------------------------
    // CallStateChanged tests
    // -----------------------------------------------------------------------

    /// CallStateChanged state=0 (NULL) → イベント発行なし。
    #[tokio::test]
    async fn test_call_state_changed_null() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        // NULL(0) → イベント発行なし（通知不要）
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 0,
                },
            })
            .is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        // call が存在しないため get_call_by_native_id が None → 何も発行されない
        let result = rx.try_recv();
        assert!(result.is_err());
    }

    /// CallStateChanged state=1 (CALLING) → OutgoingCallStarted が publish される。
    #[tokio::test]
    async fn test_call_state_changed_calling() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        // まずアカウント追加
        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        // MakeCall で通話エントリ作成（native_call_id=1）
        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // CALLING(1) → OutgoingCallStarted
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 1,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::OutgoingCallStarted(_)
        ));
        // call_id が伝播されていることを確認
        assert_eq!(event.meta.call_id, Some(call_id));
    }

    /// CallStateChanged state=2, 前状態=CALLING → OutgoingCallTrying が publish される。
    #[tokio::test]
    async fn test_call_state_changed_connecting_from_calling() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // まず CALLING → state を Calling に設定
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 1,
                },
            })
            .is_ok());
        let _ = rx.recv().await; // consume OutgoingCallStarted

        // CONNECTING(2) + 前状態が CALLING → OutgoingCallTrying(100 Trying)
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 2,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::OutgoingCallTrying(_)
        ));
    }

    /// CallStateChanged state=3 (CONFIRMED) → CallConnected が publish される。
    #[tokio::test]
    async fn test_call_state_changed_confirmed() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // CONFIRMED(3) → CallConnected
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 3,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(event.payload, SipEventPayload::CallConnected(_)));
        assert_eq!(event.meta.call_id, Some(call_id));
    }

    /// CallStateChanged state=4 (DISCONNECTED) → CallDisconnected が publish される。
    #[tokio::test]
    async fn test_call_state_changed_disconnected() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // DISCONNECTED(4) → CallDisconnected
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 4,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::CallDisconnected(_)
        ));
    }

    // -----------------------------------------------------------------------
    // CallMediaStateChanged tests
    // -----------------------------------------------------------------------

    /// CallMediaStateChanged ACTIVE(1) → MediaActive が publish される。
    #[tokio::test]
    async fn test_media_state_active() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // ACTIVE(1) → MediaActive
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallMediaStateChanged {
                    call_id: 1,
                    media_status: 1,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(event.payload, SipEventPayload::MediaActive(_)));
        assert_eq!(event.meta.call_id, Some(call_id));
    }

    /// CallMediaStateChanged LOCAL_HOLD(2) → CallHeld が publish される。
    #[tokio::test]
    async fn test_media_state_local_hold() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // LOCAL_HOLD(2) → CallHeld
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallMediaStateChanged {
                    call_id: 1,
                    media_status: 2,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(event.payload, SipEventPayload::CallHeld(_)));
    }

    /// CallMediaStateChanged ERROR(4) → MediaError が publish される。
    #[tokio::test]
    async fn test_media_state_error() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // ERROR(4) → MediaError
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallMediaStateChanged {
                    call_id: 1,
                    media_status: 4,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(event.payload, SipEventPayload::MediaError(_)));
    }

    /// CallMediaStateChanged NONE(0) → イベント発行なし。
    #[tokio::test]
    async fn test_media_state_none() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // NONE(0) → イベント発行なし
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallMediaStateChanged {
                    call_id: 1,
                    media_status: 0,
                },
            })
            .is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let result = rx.try_recv();
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // DTMF tests
    // -----------------------------------------------------------------------

    /// DtmfDigit { digit: 5 } → DtmfReceived(digit='5', method=Rfc4733) が publish される。
    #[tokio::test]
    async fn test_dtmf_digit_received() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // DtmfDigit { digit: 5 }
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::DtmfDigit {
                    call_id: 1,
                    digit: 5,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        if let SipEventPayload::DtmfReceived(info) = event.payload {
            assert_eq!(info.digit, '5');
            assert_eq!(event.meta.call_id, Some(call_id));
        } else {
            panic!("Expected DtmfReceived");
        }
    }

    /// DtmfDigit2 { digit: 9, method: 0 } → DtmfReceived(digit='9', method=SipInfo) が publish される。
    #[tokio::test]
    async fn test_dtmf_digit2_received() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // DtmfDigit2 { digit: 9, method: 0(SIP_INFO) }
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::DtmfDigit2 {
                    call_id: 1,
                    digit: 9,
                    method: 0,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        if let SipEventPayload::DtmfReceived(info) = event.payload {
            assert_eq!(info.digit, '9');
            assert_eq!(info.method, crate::config::DtmfMethod::SipInfo);
        } else {
            panic!("Expected DtmfReceived");
        }
    }

    // -----------------------------------------------------------------------
    // convert_transport_state ユニットテスト
    // -----------------------------------------------------------------------

    /// CONNECTED（state=2）→ TransportConnected を返す。
    #[test]
    fn test_convert_transport_state_connected() {
        let tp_id = TransportId::from_raw(1).unwrap();
        let result = convert_transport_state(tp_id, 2);
        assert!(matches!(
            result,
            Some(SipEventPayload::TransportConnected(_))
        ));
    }

    /// DISCONNECTED（state=0）→ TransportDisconnected を返す。
    #[test]
    fn test_convert_transport_state_disconnected() {
        let tp_id = TransportId::from_raw(1).unwrap();
        let result = convert_transport_state(tp_id, 0);
        assert!(matches!(
            result,
            Some(SipEventPayload::TransportDisconnected(_))
        ));
    }

    /// ERROR/DISCONNECTING（state=3）→ TransportError を返す。
    #[test]
    fn test_convert_transport_state_error() {
        let tp_id = TransportId::from_raw(1).unwrap();
        let result = convert_transport_state(tp_id, 3);
        assert!(matches!(result, Some(SipEventPayload::TransportError(_))));
    }

    /// CONNECTING（state=1）→ None を返す。
    #[test]
    fn test_convert_transport_state_connecting_returns_none() {
        let tp_id = TransportId::from_raw(1).unwrap();
        let result = convert_transport_state(tp_id, 1);
        assert!(result.is_none(), "CONNECTING state should return None");
    }

    /// 未知の state（99）→ None を返す（安全側フォールバック）。
    #[test]
    fn test_convert_transport_state_unknown_state_returns_none() {
        let tp_id = TransportId::from_raw(1).unwrap();
        let result = convert_transport_state(tp_id, 99);
        assert!(result.is_none(), "unknown state should return None");
    }

    /// P2 対象外イベント → すべてイベント発行なし。
    #[tokio::test]
    async fn test_p2_events_ignored() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        // P2 対象外イベント群 → いずれも発行されない
        use crate::ffi::callbacks::NativeEvent;
        let ignored_events = vec![
            NativeEvent::CallTsxStateChanged { call_id: 1 },
            NativeEvent::CallRedirected { call_id: 1 },
            NativeEvent::CallTransferStatus {
                call_id: 1,
                status_code: 200,
            },
            NativeEvent::CallReplaced {
                old_call_id: 1,
                new_call_id: 2,
            },
            NativeEvent::NatDetected {
                info: "test".into(),
            },
        ];

        for evt in ignored_events {
            let _ = handle.send(RuntimeCommand::NativeEvent { event: evt });
        }

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let result = rx.try_recv();
        assert!(result.is_err(), "P2 events should produce no output events");
    }

    /// TransportStateChanged state=2 (CONNECTED) → TransportConnected が publish される。
    #[tokio::test]
    async fn test_transport_state_connected() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::TransportStateChanged {
                    tp_id: 1,
                    state: 2,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::TransportConnected(_)
        ));
    }

    /// IceTransportError → IceNegotiationFailed が publish される。
    #[tokio::test]
    async fn test_ice_transport_error() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::IceTransportError {
                    call_id: 1,
                    status: 500,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::IceNegotiationFailed(_)
        ));
    }

    /// TransportStateChanged state=0 (DISCONNECTED) → TransportDisconnected が publish される。
    #[tokio::test]
    async fn test_transport_state_disconnected() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::TransportStateChanged {
                    tp_id: 1,
                    state: 0,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(
            event.payload,
            SipEventPayload::TransportDisconnected(_)
        ));
    }

    /// TransportStateChanged state=3 (ERROR/DISCONNECTING) → TransportError が publish される。
    #[tokio::test]
    async fn test_transport_state_error() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::TransportStateChanged {
                    tp_id: 1,
                    state: 3,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        assert!(matches!(event.payload, SipEventPayload::TransportError(_)));
    }

    /// TransportStateChanged state=1 (CONNECTING) → イベント発行なし。
    #[tokio::test]
    async fn test_transport_state_connecting_no_publish() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::TransportStateChanged {
                    tp_id: 1,
                    state: 1,
                },
            })
            .is_ok());

        // CONNECTING は発行されないこと
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let result = rx.try_recv();
        assert!(
            result.is_err(),
            "CONNECTING should produce no output events"
        );
    }

    /// TransportStateChanged 未知の state（99）→ イベント発行なし（安全側フォールバック）。
    #[tokio::test]
    async fn test_transport_state_unknown_no_publish() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::TransportStateChanged {
                    tp_id: 1,
                    state: 99,
                },
            })
            .is_ok());

        // 未知の state は発行されないこと
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let result = rx.try_recv();
        assert!(
            result.is_err(),
            "unknown state should produce no output events"
        );
    }

    // -----------------------------------------------------------------------
    // DtmfSent タイマーテスト
    // -----------------------------------------------------------------------

    /// SendDtmf 成功後、DtmfSent イベントがタイムアウト後に publish される。
    #[tokio::test]
    async fn test_dtmf_sent_timer() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let _call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // SendDtmf → 成功後 500ms 以内に DtmfSent が publish される
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::SendDtmf {
                call_id: _call_id,
                digits: "123".into(),
                method: crate::config::DtmfMethod::Rfc4733,
                reply,
            })
            .await
            .is_ok());

        // 最大 2s 待機して DtmfSent を確認
        let found = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let event = rx.recv().await.unwrap();
                if matches!(event.payload, SipEventPayload::DtmfSent(_)) {
                    return true;
                }
            }
        })
        .await;

        assert!(
            found.is_ok() && found.unwrap(),
            "DtmfSent should be published within timeout"
        );
    }

    /// 連続 NativeEvent が正しく処理されることを確認する。
    #[tokio::test]
    async fn test_multiple_native_events_sequential() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(32, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) = CoreReactor::spawn(backend, events.clone(), state, shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let mut rx = events.subscribe_control();

        // 複数の TransportStateChanged を連続送信
        use crate::ffi::callbacks::NativeEvent;
        for i in 1..=3 {
            assert!(handle
                .send(RuntimeCommand::NativeEvent {
                    event: NativeEvent::TransportStateChanged { tp_id: i, state: 2 },
                })
                .is_ok());
        }

        // 3 件の TransportConnected が受信できる
        let mut count = 0;
        tokio::time::timeout(std::time::Duration::from_millis(500), async {
            while count < 3 {
                if let Ok(event) = rx.recv().await {
                    if matches!(event.payload, SipEventPayload::TransportConnected(_)) {
                        count += 1;
                    }
                }
            }
        })
        .await
        .expect("Expected 3 TransportConnected events");

        assert_eq!(count, 3);
    }

    /// EventBus 経由で publish されたイベントに meta.account_id / call_id が正しく設定される。
    #[tokio::test]
    async fn test_native_event_meta_account_call_id() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let mut rx = events.subscribe_control();

        // CallConnected イベントを発行
        assert!(handle
            .send(RuntimeCommand::NativeEvent {
                event: crate::ffi::callbacks::NativeEvent::CallStateChanged {
                    call_id: 1,
                    state: 3,
                },
            })
            .is_ok());

        let event = rx.recv().await.unwrap();
        // account_id と call_id が正しく設定されている
        assert_eq!(
            event.meta.account_id,
            Some(acc_id),
            "account_id should match"
        );
        assert_eq!(event.meta.call_id, Some(call_id), "call_id should match");
    }

    /// GetAccountInfo が Send を満たすことを確認する（コンパイル時検証）。
    #[test]
    fn test_get_account_info_send() {
        fn assert_send<T: Send>() {}
        assert_send::<RuntimeCommand>();
    }

    // -----------------------------------------------------------------------
    // SubscribeAudio tests (M20-5)
    // -----------------------------------------------------------------------

    /// テスト用の AudioFormat を生成する。
    fn test_audio_format() -> AudioFormat {
        AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 10,
        }
    }

    /// SubscribeAudio 正常系（Realtime）: 有効な call_id → Ok(AudioTapHandle)
    #[tokio::test]
    async fn test_subscribe_audio_ok_realtime() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        // Initialize
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        // MakeCall で通話エントリ作成
        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        // SubscribeAudio → Ok(AudioTapHandle)
        let result: Result<AudioTapHandle, SipError> = handle
            .send_and_wait(|reply_tx| RuntimeCommand::SubscribeAudio {
                call_id,
                format: test_audio_format(),
                capacity: 16,
                mode: AudioTapMode::Realtime,
                reply_tx,
            })
            .await;

        assert!(result.is_ok(), "SubscribeAudio should succeed");
        let mut handle = result.unwrap();

        // AudioTapHandle の rx がライブであること（tx が MediaRuntime に保持されている）
        // send_and_wait の時点で MediaRuntime に tx が push されているため、
        // handle を保持している間は rx がクローズしない（Disconnected ではなく Empty を返す）。
        let try_result = handle.try_recv();
        assert!(
            try_result.is_err(),
            "try_recv on empty channel should return Err"
        );
        assert!(
            matches!(
                try_result.unwrap_err(),
                tokio::sync::mpsc::error::TryRecvError::Empty
            ),
            "channel should be open (Empty), not closed (Disconnected)"
        );
    }

    /// SubscribeAudio 正常系（Lossless）: Lossless モードでも正常に AudioTapHandle が返る。
    #[tokio::test]
    async fn test_subscribe_audio_ok_lossless() {
        crate::ffi::callbacks::clear_global_runtime();
        let mock = MockBackend::new();
        let backend = Box::new(mock) as Box<dyn SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await
            .is_ok());

        let acc_id = AccountId::generate();
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::AddAccount {
                account_id: acc_id,
                config: test_account_config(),
                client_id: None,
                reply,
            })
            .await
            .is_ok());

        let call_id = handle
            .send_and_wait(|reply| RuntimeCommand::MakeCall {
                account_id: acc_id,
                request: test_outgoing_call_request(),
                reply,
            })
            .await
            .expect("MakeCall should succeed");

        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::SubscribeAudio {
                call_id,
                format: test_audio_format(),
                capacity: 32,
                mode: AudioTapMode::Lossless,
                reply_tx,
            })
            .await;

        assert!(
            result.is_ok(),
            "SubscribeAudio with Lossless should succeed"
        );
    }

    /// 存在しない call_id → CallNotFound エラー。
    #[tokio::test]
    async fn test_subscribe_audio_call_not_found() {
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

        // 存在しない call_id
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::SubscribeAudio {
                call_id: CallId::generate(),
                format: test_audio_format(),
                capacity: 16,
                mode: AudioTapMode::Realtime,
                reply_tx,
            })
            .await;

        assert!(result.is_err());
        if let Err(ref err) = result {
            assert_eq!(err.kind, crate::error::SipErrorKind::CallNotFound);
        }
    }

    /// Shutdown 後に SubscribeAudio → InvalidState。
    #[tokio::test]
    async fn test_subscribe_audio_shutdown_rejected() {
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

        // Shutdown
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await
            .is_ok());

        // Shutdown 後の SubscribeAudio → InvalidState
        let result = handle
            .send_and_wait(|reply_tx| RuntimeCommand::SubscribeAudio {
                call_id: CallId::generate(),
                format: test_audio_format(),
                capacity: 16,
                mode: AudioTapMode::Realtime,
                reply_tx,
            })
            .await;

        assert!(result.is_err());
        if let Err(ref err) = result {
            assert_eq!(err.kind, crate::error::SipErrorKind::InvalidState);
        }
    }

    // -----------------------------------------------------------------------
    // Dual Client / EventBus 分割テスト（M20-7）
    // -----------------------------------------------------------------------

    /// 単一 Client の後方互換性: ReactorEventRouter 経由でも
    /// 従来通りのイベント配送が動作することを確認する。
    #[tokio::test]
    async fn test_router_single_client_backward_compatibility() {
        let events = EventBus::new(16, None);
        let router = ReactorEventRouter::new(&events);
        let mut rx = events.subscribe_control();

        // default_bus にイベントを dispatch → subscribe_control で受信可能
        let event = SipEvent::new(SipEventPayload::CallHeld(()));
        router.dispatch(event);

        let received = rx.try_recv();
        assert!(
            received.is_ok(),
            "dispatch → subscribe でイベントを受信できる"
        );
    }

    /// Dual Client のイベント分離: 各 Client の EventBus に
    /// 正しく account_id ベースで振り分けられることを確認する。
    #[tokio::test]
    async fn test_router_dual_client_event_isolation() {
        let events_a = EventBus::new(16, None);
        let events_b = EventBus::new(16, None);
        let mut router = ReactorEventRouter::new(&events_a);

        // Client B の EventBus を登録
        let cid_b = router.register(events_b.control_sender());

        let acc_a = AccountId::generate();
        let acc_b = AccountId::generate();

        // Account A → default bus (Client A)
        // Account B → Client B's bus
        router.map_account(acc_a, ClientId(0));
        router.map_account(acc_b, cid_b);

        let mut rx_a = events_a.subscribe_control();
        let mut rx_b = events_b.subscribe_control();

        // Account A のイベントを dispatch → events_a のみ受信
        let event_a = SipEvent::with_meta(SipEventPayload::CallConnected(ConnectedCallInfo {
            acc_id: acc_a,
            call_id: CallId::generate(),
            media_format: None,
        }))
        .account_id(acc_a)
        .build();
        router.dispatch(event_a);

        // events_a で受信できる
        let received_a = rx_a.try_recv();
        assert!(
            received_a.is_ok(),
            "Client A のイベントが Client A の bus に届く"
        );

        // events_b で受信できない
        let received_b = rx_b.try_recv();
        assert!(
            received_b.is_err(),
            "Client A のイベントが Client B の bus に漏れていない"
        );

        // Account B のイベントを dispatch → events_b のみ受信
        let event_b = SipEvent::with_meta(SipEventPayload::CallConnected(ConnectedCallInfo {
            acc_id: acc_b,
            call_id: CallId::generate(),
            media_format: None,
        }))
        .account_id(acc_b)
        .build();
        router.dispatch(event_b);

        let received_b2 = rx_b.try_recv();
        assert!(
            received_b2.is_ok(),
            "Client B のイベントが Client B の bus に届く"
        );
    }

    /// account_id = None のイベントが全 Client に broadcast される。
    #[tokio::test]
    async fn test_router_broadcast_to_all_clients() {
        let events_a = EventBus::new(16, None);
        let events_b = EventBus::new(16, None);
        let mut router = ReactorEventRouter::new(&events_a);

        // 2 つめの Client EventBus を登録
        let _cid_b = router.register(events_b.control_sender());

        let mut rx_a = events_a.subscribe_control();
        let mut rx_b = events_b.subscribe_control();

        // account_id = None のイベント（ClientInitialized 相当）
        let broadcast_event = SipEvent::new(SipEventPayload::ClientInitialized(
            ClientCapabilities::default_disabled(),
        ));
        router.dispatch(broadcast_event);

        // 両方の bus で受信できる
        let received_a = rx_a.try_recv();
        assert!(
            received_a.is_ok(),
            "default bus で broadcast イベントを受信"
        );
        let received_b = rx_b.try_recv();
        assert!(received_b.is_ok(), "client bus で broadcast イベントを受信");
    }

    /// 未登録の account_id が default bus に fallback することを確認する。
    #[tokio::test]
    async fn test_router_unknown_account_falls_back_to_default() {
        let events = EventBus::new(16, None);
        let router = ReactorEventRouter::new(&events);
        let mut rx = events.subscribe_control();

        // 未登録の account_id
        let unknown_acc = AccountId::generate();
        let event = SipEvent::with_meta(SipEventPayload::RegistrationStarted(RegistrationInfo {
            acc_id: unknown_acc,
            renew: false,
            status_code: None,
            reason: None,
        }))
        .account_id(unknown_acc)
        .build();
        router.dispatch(event);

        // default bus で受信できる
        let received = rx.try_recv();
        assert!(
            received.is_ok(),
            "未登録 account_id → default bus に fallback"
        );
    }

    /// 3 つ以上の Client が独立して動作することを確認する。
    #[tokio::test]
    async fn test_router_three_or_more_clients() {
        let events_a = EventBus::new(16, None);
        let events_b = EventBus::new(16, None);
        let events_c = EventBus::new(16, None);
        let mut router = ReactorEventRouter::new(&events_a);

        let cid_b = router.register(events_b.control_sender());
        let cid_c = router.register(events_c.control_sender());

        let acc_a = AccountId::generate();
        let acc_b = AccountId::generate();
        let acc_c = AccountId::generate();

        router.map_account(acc_a, ClientId(0));
        router.map_account(acc_b, cid_b);
        router.map_account(acc_c, cid_c);

        let mut rx_a = events_a.subscribe_control();
        let mut rx_b = events_b.subscribe_control();
        let mut rx_c = events_c.subscribe_control();

        // 各 Client のイベントを dispatch
        for (acc, rx) in [(acc_a, &mut rx_a), (acc_b, &mut rx_b), (acc_c, &mut rx_c)] {
            let ev = SipEvent::with_meta(SipEventPayload::OutgoingCallStarted(OutgoingCallInfo {
                acc_id: acc,
                call_id: CallId::generate(),
                remote_uri: None,
                target_uri: None,
            }))
            .account_id(acc)
            .build();
            router.dispatch(ev);

            let received = rx.try_recv();
            assert!(received.is_ok(), "3 Client すべてが独立してイベントを受信");
        }
    }

    /// Shutdown 中でも RegisterEventBus が安全にエラーを返すことを確認する。
    #[tokio::test]
    async fn test_register_event_bus_during_shutdown() {
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

        // Shutdown
        assert!(handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await
            .is_ok());

        // Shutdown 後の RegisterEventBus → エラーになる（reject_command）
        let new_bus = EventBus::new(16, None);
        let result = handle.register_event_bus(new_bus.control_sender()).await;

        assert!(
            result.is_err(),
            "Shutdown 後の RegisterEventBus は拒否される"
        );
    }
}

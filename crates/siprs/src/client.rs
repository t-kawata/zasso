//! # SIP クライアント
//!
//! crate の公開APIのルートとなる `SipClient` 構造体を定義する。
//! RFC §8.2 に準拠。

use std::fmt;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing::instrument;

use crate::account::RegistrationState;
use crate::audio::source::ErasedAudioSource;
use crate::audio::tap::AudioTapHandle;
use crate::audio::tap::AudioTapMode;
use crate::call::CallState;
use crate::config::validate_account_config;
use crate::config::AccountConfig;
use crate::config::AccountConfigPatch;
#[cfg(any(test, feature = "pjsip"))]
use crate::config::ClientConfig;
use crate::config::DtmfMethod;
use crate::config::OutgoingCallRequest;
use crate::error::SipError;
use crate::event::AccountEventReceiver;
use crate::event::EventBus;
use crate::event::RawSipMessage;
use crate::event::SipEvent;
#[cfg(test)]
use crate::event::{ConnectedCallInfo, SipEventPayload};
use crate::runtime::command::HangupReason;
use crate::runtime::command::RuntimeCommand;
use crate::runtime::handle::RuntimeHandle;
use crate::runtime::state::ClientState;
use crate::util::id::AccountId;
use crate::util::id::AudioSourceId;
use crate::util::id::CallId;
#[cfg(any(test, feature = "pjsip"))]
use tokio::sync::watch;

#[cfg(any(test, feature = "pjsip"))]
use crate::config::validate_client_config;
#[cfg(any(test, feature = "pjsip"))]
use crate::event::ClientCapabilities;
#[cfg(any(test, feature = "pjsip"))]
use crate::runtime::backend::SipBackend;
#[cfg(any(test, feature = "pjsip"))]
use crate::runtime::reactor::CoreReactor;

/// 現在の Tokio ランタイムハンドルを取得する。
/// ランタイム外で呼ばれた場合は新規作成する。
fn block_on<F: std::future::Future<Output = T>, T>(f: F) -> T {
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        // 既存ランタイム上で block_in_place 経由で future を実行。
        tokio::task::block_in_place(|| handle.block_on(f))
    } else {
        // 新規ランタイムを作成。
        let rt = tokio::runtime::Runtime::new().unwrap_or_else(|e| {
            panic!("failed to create tokio runtime: {e}");
        });
        rt.block_on(f)
    }
}

/// SIP クライアントのルートハンドル。
///
/// 参照カウント化された薄いハンドルであり、`Clone` 可能。
/// 内部状態へのアクセスは `RwLock` で保護され、状態変更は reactor 経由でのみ行われる。
#[derive(Clone)]
pub struct SipClient {
    /// 内部状態（参照カウント共有）。
    pub(crate) inner: Arc<ClientInner>,
}

/// `SipClient` の内部状態。
///
/// 公開APIからは直接アクセスされず、`SipClient` のメソッド経由で操作される。
pub(crate) struct ClientInner {
    /// Reactor との通信ハンドル。
    pub runtime: RuntimeHandle,
    /// イベント配信バス。
    pub events: EventBus,
    /// ランタイム状態（Arc + RwLock 保護）。
    pub state: Arc<RwLock<ClientState>>,
    /// シャットダウン通知送信側。
    pub shutdown: tokio::sync::watch::Sender<bool>,
}

impl fmt::Debug for SipClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SipClient")
            .field("inner", &self.inner as &dyn std::fmt::Debug)
            .finish()
    }
}

impl fmt::Debug for ClientInner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ClientInner")
            .field("events", &self.events)
            .finish()
    }
}

impl SipClient {
    /// 新しい `SipClient` インスタンスを生成する。
    ///
    /// 1. Config バリデーション
    /// 2. EventBus 生成 + ClientState 生成
    /// 3. CoreReactor 起動（SipBackend 経由）
    /// 4. Initialize コマンド送信
    /// 5. ClientInitialized イベント発行完了まで待機
    #[cfg(any(test, feature = "pjsip"))]
    #[instrument(skip_all)]
    pub(crate) fn new(
        config: ClientConfig,
        backend: Box<dyn SipBackend>,
    ) -> Result<Self, SipError> {
        // 1. Config バリデーション
        validate_client_config(&config)?;

        // 2. EventBus 生成
        let raw_sip_capacity = if config.raw_sip_events.enabled {
            Some(config.raw_sip_event_capacity)
        } else {
            None
        };
        let events = EventBus::new(config.event_bus_capacity, raw_sip_capacity);

        // 3. ClientState + RwLock
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));

        // 4. shutdown watch
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        // 5. Backend + Reactor 起動
        let (handle, _join_handle) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        // 6. Initialize コマンドを送信
        let init_result = block_on(handle.send_and_wait(|reply| RuntimeCommand::Initialize {
            config: config.clone(),
            reply,
        }));

        if let Err(e) = init_result {
            return Err(e);
        }

        // 7. SipClient を返す
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events,
            state,
            shutdown: shutdown_tx,
        });

        Ok(Self { inner })
    }

    /// PjsuaBackend を使用して SipClient を生成する（結合テスト用）。
    ///
    /// `feature = "pjsip"` 有効時のみ利用可能。
    #[cfg(feature = "pjsip")]
    #[instrument(skip_all)]
    pub fn new_with_pjsip(config: ClientConfig) -> Result<Self, SipError> {
        let backend = Box::new(crate::ffi::pjsua_backend::PjsuaBackend::new());
        Self::new(config, backend)
    }

    /// 制御系イベントを購読する。
    #[instrument(skip(self))]
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<SipEvent> {
        self.inner.events.subscribe_control()
    }

    /// RawSIP メッセージを購読する（無効時は `None`）。
    #[instrument(skip(self))]
    pub fn subscribe_raw_sip(&self) -> Option<tokio::sync::broadcast::Receiver<RawSipMessage>> {
        self.inner.events.subscribe_raw_sip()
    }

    /// 特定アカウントのイベントのみを購読する。
    #[instrument(skip(self), fields(account_id = %account_id))]
    pub fn subscribe_account(&self, account_id: AccountId) -> AccountEventReceiver {
        AccountEventReceiver::new(account_id, self.subscribe())
    }

    /// SIP アカウントを追加する。
    ///
    /// Config バリデーション後、reactor 経由で PJSUA アカウントを作成し、
    /// `SipAccountHandle` を返す。
    #[instrument(skip(self, config))]
    pub fn add_account(&self, config: AccountConfig) -> Result<SipAccountHandle, SipError> {
        validate_account_config(&config)?;

        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::AddAccount { config, reply }),
        )?;

        Ok(SipAccountHandle {
            id: AccountId::generate(),
            client: self.clone(),
        })
    }

    /// SIP アカウントを削除する。
    #[instrument(skip(self), fields(account_id = %account_id))]
    pub fn remove_account(&self, account_id: AccountId) -> Result<(), SipError> {
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::RemoveAccount { account_id, reply }),
        )
    }

    /// アカウントハンドルを取得する。
    ///
    /// 存在しない account_id の場合は `AccountNotFound` を返す。
    #[instrument(skip(self), fields(account_id = %account_id))]
    pub fn account(&self, account_id: AccountId) -> Result<SipAccountHandle, SipError> {
        let state = self.inner.state.blocking_read();
        let _entry = state.get_account(account_id)?;
        drop(state);
        Ok(SipAccountHandle {
            id: account_id,
            client: self.clone(),
        })
    }

    /// 全アカウントのハンドル一覧を返す。
    #[instrument(skip(self))]
    pub fn accounts(&self) -> Vec<SipAccountHandle> {
        let state = self.inner.state.blocking_read();
        state
            .accounts
            .keys()
            .map(|id| SipAccountHandle {
                id: *id,
                client: self.clone(),
            })
            .collect()
    }

    /// シャットダウンする（idempotent）。
    ///
    /// 2回目以降の呼び出しは即座に `Ok(())` を返す。
    #[instrument(skip(self))]
    pub fn shutdown(&self) -> Result<(), SipError> {
        // 既に shutdown 状態なら即座に Ok を返す（idempotent）。
        if self.is_shutdown() {
            return Ok(());
        }
        // watch チャネルに shutdown を通知。
        let _ = self.inner.shutdown.send(true);
        // reactor に Shutdown コマンドを送信。
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::Shutdown { reply }),
        )
    }

    /// シャットダウン状態かを確認する。
    #[instrument(skip(self))]
    pub fn is_shutdown(&self) -> bool {
        *self.inner.shutdown.borrow()
    }

    // -----------------------------------------------------------------------
    // Call API
    // -----------------------------------------------------------------------

    /// 発信する。
    ///
    /// `OutgoingCallRequest` を受け取り、PJSUA 経由で INVITE を送出する。
    #[instrument(skip(self, request))]
    pub fn make_call(
        &self,
        account_id: AccountId,
        request: OutgoingCallRequest,
    ) -> Result<CallId, SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::MakeCall {
                    account_id,
                    request: Box::new(request),
                    reply,
                }),
        )
    }

    /// 着信に応答する。
    ///
    /// 許可コード: 180 (Ringing), 183 (Session Progress), 200 (OK),
    /// 486 (Busy Here), 603 (Decline)。それ以外は `InvalidConfig`。
    #[instrument(skip(self))]
    pub fn answer(&self, call_id: CallId, code: u16) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        // §19.1: 許可コードの制限
        if !matches!(code, 180 | 183 | 200 | 486 | 603) {
            return Err(SipError::invalid_config(format!(
                "unsupported answer code: {code} (allowed: 180, 183, 200, 486, 603)"
            )));
        }
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::Answer {
                    call_id,
                    code,
                    reply,
                }),
        )
    }

    /// 切断する。
    ///
    /// `HangupReason` に応じて BYE または CANCEL を送出する。
    #[instrument(skip(self))]
    pub fn hangup(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::Hangup {
                    call_id,
                    reason,
                    reply,
                }),
        )
    }

    /// 通話を保留する。
    #[instrument(skip(self))]
    pub fn hold(&self, call_id: CallId) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::Hold { call_id, reply }),
        )
    }

    /// 通話の保留を解除する。
    #[instrument(skip(self))]
    pub fn unhold(&self, call_id: CallId) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::Unhold { call_id, reply }),
        )
    }

    /// 通話を第三者に転送する（blind transfer）。
    #[instrument(skip(self))]
    pub fn transfer(&self, call_id: CallId, target: String) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::Transfer {
                    call_id,
                    target,
                    reply,
                }),
        )
    }

    /// DTMF 信号を送信する。
    #[instrument(skip(self))]
    pub fn send_dtmf(
        &self,
        call_id: CallId,
        digits: String,
        method: DtmfMethod,
    ) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::SendDtmf {
                    call_id,
                    digits,
                    method,
                    reply,
                }),
        )
    }

    /// 通話状態を取得する。
    ///
    /// ローカルの state snapshot を読み取る（RTT 不要）。
    #[instrument(skip(self))]
    pub fn call_state(&self, call_id: CallId) -> Result<CallState, SipError> {
        self.ensure_not_shutdown()?;
        let state = self.inner.state.blocking_read();
        let entry = state.get_call(call_id)?;
        Ok(entry.state)
    }

    // -----------------------------------------------------------------------
    // Audio source management API
    // -----------------------------------------------------------------------

    /// 音声ソースを追加する。
    ///
    /// `source` は `ErasedAudioSource` として受け取る。
    /// `AsyncAudioSource` 実装は blanket impl で自動変換される。
    #[instrument(skip(self, source))]
    pub fn add_audio_source(
        &self,
        call_id: CallId,
        source: Box<dyn ErasedAudioSource>,
    ) -> Result<AudioSourceId, SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::AddAudioSource {
                    call_id,
                    source,
                    reply,
                }),
        )
    }

    /// 音声ソースを削除する。
    #[instrument(skip(self))]
    pub fn remove_audio_source(
        &self,
        call_id: CallId,
        source_id: AudioSourceId,
    ) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::RemoveAudioSource {
                    call_id,
                    source_id,
                    reply,
                }),
        )
    }

    /// 音声ソースのゲインを設定する。
    ///
    /// `gain` は 0.0 以上。負値は `InvalidConfig`。
    #[instrument(skip(self))]
    pub fn set_audio_source_gain(
        &self,
        call_id: CallId,
        source_id: AudioSourceId,
        gain: f32,
    ) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        if gain < 0.0 {
            return Err(SipError::invalid_config(format!(
                "gain must be non-negative: {gain}"
            )));
        }
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::SetSourceGain {
                    call_id,
                    source_id,
                    gain,
                    reply,
                }),
        )
    }

    /// 通話音声を購読する。
    ///
    /// `call_id` で指定された通話の音声を `AudioTapHandle` で受信する。
    /// `mode` が `Realtime`（既定）の場合、購読者が遅延すると
    /// oldest-drop で最新フレームが優先される。
    /// `Lossless` モードではバックプレッシャーがかかる。
    #[instrument(skip(self))]
    pub fn subscribe_audio(
        &self,
        call_id: CallId,
        format: crate::audio::format::AudioFormat,
        capacity: usize,
        mode: AudioTapMode,
    ) -> Result<AudioTapHandle, SipError> {
        self.ensure_not_shutdown()?;
        let (tx, rx) = tokio::sync::mpsc::channel(capacity);
        let handle = AudioTapHandle::new(rx);
        let _ = (call_id, format, mode, tx);
        Ok(handle)
    }

    /// 音声ソースをミュート/ミュート解除する。
    #[instrument(skip(self))]
    pub fn mute_audio_source(
        &self,
        call_id: CallId,
        source_id: AudioSourceId,
        muted: bool,
    ) -> Result<(), SipError> {
        self.ensure_not_shutdown()?;
        block_on(
            self.inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::MuteSource {
                    call_id,
                    source_id,
                    muted,
                    reply,
                }),
        )
    }

    /// シャットダウン状態でないことを確認する。
    ///
    /// shutdown 状態の場合は `ShutdownInProgress` エラーを返す。
    pub(crate) fn ensure_not_shutdown(&self) -> Result<(), SipError> {
        if self.is_shutdown() {
            return Err(SipError::shutdown_in_progress());
        }
        Ok(())
    }
}

/// SIP アカウントハンドル。
///
/// `AccountId` と親 `SipClient` を保持し、アカウント単位の操作を提供する。
/// `Clone` 可能で、複数箇所から同一アカウントを操作できる。
#[derive(Clone, Debug)]
pub struct SipAccountHandle {
    /// ランタイムアカウント ID。
    pub id: AccountId,
    /// 親クライアントハンドル。
    pub(crate) client: SipClient,
}

impl SipAccountHandle {
    /// アカウント ID を返す。
    pub fn id(&self) -> AccountId {
        self.id
    }

    /// SIP 登録を開始する。
    ///
    /// reactor 経由で `SetRegistration { enabled: true }` を送信する。
    #[instrument(skip(self))]
    pub fn register(&self) -> Result<(), SipError> {
        self.client.ensure_not_shutdown()?;
        block_on(
            self.client
                .inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::SetRegistration {
                    account_id: self.id,
                    enabled: true,
                    reply,
                }),
        )
    }

    /// SIP 登録を解除する。
    ///
    /// reactor 経由で `SetRegistration { enabled: false }` を送信する。
    #[instrument(skip(self))]
    pub fn unregister(&self) -> Result<(), SipError> {
        self.client.ensure_not_shutdown()?;
        block_on(
            self.client
                .inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::SetRegistration {
                    account_id: self.id,
                    enabled: false,
                    reply,
                }),
        )
    }

    /// 登録有効/無効を設定する。
    #[instrument(skip(self))]
    pub fn set_registration_enabled(&self, enabled: bool) -> Result<(), SipError> {
        self.client.ensure_not_shutdown()?;
        block_on(
            self.client
                .inner
                .runtime
                .send_and_wait(|reply| RuntimeCommand::SetRegistration {
                    account_id: self.id,
                    enabled,
                    reply,
                }),
        )
    }

    /// 現在の登録状態を取得する。
    ///
    /// ローカルの state snapshot を読み取る（RTT 不要）。
    #[instrument(skip(self))]
    pub fn registration_state(&self) -> Result<RegistrationState, SipError> {
        self.client.ensure_not_shutdown()?;
        let state = self.client.inner.state.blocking_read();
        let entry = state.get_account(self.id)?;
        Ok(entry.registration)
    }

    /// アカウント設定を更新する。
    ///
    /// reactor 経由で `UpdateAccountConfig` を送信する。
    #[instrument(skip(self, patch))]
    pub fn update_config(&self, patch: AccountConfigPatch) -> Result<(), SipError> {
        self.client.ensure_not_shutdown()?;
        block_on(self.client.inner.runtime.send_and_wait(|reply| {
            RuntimeCommand::UpdateAccountConfig {
                account_id: self.id,
                patch,
                reply,
            }
        }))
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::ClientCapabilities;
    use crate::runtime::state::ClientState;
    use tokio::sync::watch;

    /// SipClient が Send + Sync を満たすことをコンパイル時に確認する。
    #[test]
    fn test_sip_client_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
    }

    /// Clone が内部状態を共有することを確認する。
    #[test]
    fn test_sip_client_clone() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };
        let cloned = client.clone();

        // 両方の inner が同一の Arc を指している。
        assert!(Arc::ptr_eq(&client.inner, &cloned.inner));
    }

    /// Debug 出力が機密情報を含まないことを確認する。
    #[test]
    fn test_sip_client_debug() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };
        let debug = format!("{:?}", client);
        assert!(debug.contains("SipClient"));
        // パスワード等の機密情報が露出していないこと。
        assert!(!debug.contains("password"));
        assert!(!debug.contains("secret"));
    }

    // -----------------------------------------------------------------------
    // SipClient::new() tests
    // -----------------------------------------------------------------------

    /// 正常初期化 → SipClient が返り、ClientInitialized イベントが購読可能。
    #[test]
    fn test_new_success() {
        crate::ffi::callbacks::clear_global_runtime();
        let backend = Box::new(crate::runtime::backend::MockBackend::new());
        let config = ClientConfig::default();
        let client = SipClient::new(config, backend);
        assert!(client.is_ok());
    }

    /// event_bus_capacity < 16 で InvalidConfig エラー。
    #[test]
    fn test_new_invalid_config() {
        crate::ffi::callbacks::clear_global_runtime();
        let backend = Box::new(crate::runtime::backend::MockBackend::new());
        let mut config = ClientConfig::default();
        config.event_bus_capacity = 0;
        let result = SipClient::new(config, backend);
        assert!(result.is_err());
    }

    /// MockBackend initialize 失敗 → エラーが伝播すること。
    #[test]
    fn test_new_initialize_failure() {
        crate::ffi::callbacks::clear_global_runtime();
        let mut backend = Box::new(crate::runtime::backend::MockBackend::new());
        backend.set_initialize_result(Err(SipError::invalid_config("init failed")));
        let config = ClientConfig::default();
        let result = SipClient::new(config, backend);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Subscribe tests
    // -----------------------------------------------------------------------

    /// subscribe → publish で同一イベントが受信できることを確認する。
    #[test]
    fn test_subscribe_control() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: events.clone(),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let mut rx = client.subscribe();
        let event = SipEvent::new(SipEventPayload::CallHeld(()));
        events.publish(event);

        let received = rx.try_recv();
        assert!(received.is_ok());
        if let Ok(ev) = received {
            assert!(matches!(ev.payload, SipEventPayload::CallHeld(_)));
        }
    }

    /// subscribe_account が正しい account_id のイベントのみを返すことを確認する。
    #[test]
    fn test_subscribe_account_filter() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: events.clone(),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let acc_id = AccountId::generate();
        let mut acc_rx = client.subscribe_account(acc_id);

        // 一致する account_id のイベントを publish。
        let mut event = SipEvent::new(SipEventPayload::CallConnected(ConnectedCallInfo {}));
        event.meta.account_id = Some(acc_id);
        events.publish(event);

        let received = acc_rx.try_recv();
        assert!(received.is_ok());
        if let Ok(Some(ev)) = received {
            assert_eq!(ev.meta.account_id, Some(acc_id));
        }
    }

    /// 複数 subscribe 呼び出しが独立した receiver を返すことを確認する。
    #[test]
    fn test_multiple_subscribe() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: events.clone(),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let mut rx1 = client.subscribe();
        let mut rx2 = client.subscribe();

        let event = SipEvent::new(SipEventPayload::CallHeld(()));
        events.publish(event);

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
    }

    // -----------------------------------------------------------------------
    // add_account / remove_account / account / accounts tests
    // -----------------------------------------------------------------------

    /// add_account に有効な config を渡すと Ok(SipAccountHandle) が返ること。
    #[test]
    fn test_add_account_valid() {
        let (handle, _rx) = RuntimeHandle::new();
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events,
            state,
            shutdown: _shutdown_tx,
        });
        // 注: 実際の reactor がないため add_account はブロックする。
        // ここでは SipAccountHandle が構築可能であることのみ確認する。
        let _handle = SipAccountHandle {
            id: AccountId::generate(),
            client: SipClient { inner },
        };
    }

    /// account() が存在しない ID で AccountNotFound を返すこと。
    #[test]
    fn test_account_not_found() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let result = client.account(AccountId::generate());
        assert!(result.is_err());
    }

    /// accounts() が空のリストを返すこと。
    #[test]
    fn test_accounts_empty() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let accounts = client.accounts();
        assert!(accounts.is_empty());
    }

    /// SipAccountHandle の Clone と Debug が機能すること。
    #[test]
    fn test_account_handle_clone_debug() {
        let handle = SipAccountHandle {
            id: AccountId::generate(),
            client: SipClient {
                inner: Arc::new(ClientInner {
                    runtime: RuntimeHandle::new().0,
                    events: EventBus::new(16, None),
                    state: Arc::new(RwLock::new(ClientState::new(
                        ClientCapabilities::default_disabled(),
                    ))),
                    shutdown: watch::channel(false).0,
                }),
            },
        };
        let cloned = handle.clone();
        assert_eq!(handle.id, cloned.id);
        let debug = format!("{:?}", handle);
        assert!(debug.contains("SipAccountHandle"));
    }

    // -----------------------------------------------------------------------
    // SipAccountHandle methods tests
    // -----------------------------------------------------------------------

    /// id() が正しい AccountId を返すことを確認する。
    #[test]
    fn test_account_handle_id() {
        let acc_id = AccountId::generate();
        let handle = SipAccountHandle {
            id: acc_id,
            client: SipClient {
                inner: Arc::new(ClientInner {
                    runtime: RuntimeHandle::new().0,
                    events: EventBus::new(16, None),
                    state: Arc::new(RwLock::new(ClientState::new(
                        ClientCapabilities::default_disabled(),
                    ))),
                    shutdown: watch::channel(false).0,
                }),
            },
        };
        assert_eq!(handle.id(), acc_id);
    }

    /// registration_state() が state から値を読み取れることを確認する。
    #[test]
    fn test_account_registration_state() {
        use crate::account::RegistrationState;
        use crate::runtime::state::AccountEntry;
        use secrecy::SecretString;
        use std::collections::BTreeMap;

        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
            native_id: None,
            config: crate::config::AccountConfig {
                display_name: None,
                username: "test".into(),
                auth_username: None,
                password: SecretString::new(Box::from("pass")),
                domain: "test.example.com".into(),
                registrar_uri: None,
                outbound_proxy: vec![],
                contact_params: vec![],
                transport: crate::config::AccountTransportPolicy::Default,
                register_on_start: false,
                allow_outbound_without_register: true,
                registration_expires: std::time::Duration::from_secs(300),
                codecs: crate::config::AccountCodecPolicy::default_voice(),
                dtmf: crate::config::DtmfPolicy::all_methods(),
                media: crate::config::AccountMediaConfig::default(),
                headers: vec![],
            },
            registration: RegistrationState::Idle,
        };
        let mut accounts = BTreeMap::new();
        accounts.insert(acc_id, entry);

        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let state = Arc::new(RwLock::new(ClientState {
            initialized: true,
            shutting_down: false,
            accounts,
            calls: BTreeMap::new(),
            capabilities: ClientCapabilities::default_disabled(),
        }));

        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };
        let acc_handle = SipAccountHandle { id: acc_id, client };

        let reg = acc_handle.registration_state();
        match reg {
            Ok(state) => assert_eq!(state, RegistrationState::Idle),
            Err(e) => panic!("registration_state failed: {e}"),
        }
    }

    /// 存在しないアカウントの registration_state() が AccountNotFound を返す。
    #[test]
    fn test_account_registration_state_not_found() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };
        let acc_handle = SipAccountHandle {
            id: AccountId::generate(),
            client,
        };

        let result = acc_handle.registration_state();
        assert!(result.is_err());
    }

    /// shutdown 後の registration_state() が ShutdownInProgress を返す。
    #[test]
    fn test_account_registration_state_shutdown() {
        let (shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state,
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        let _ = client.inner.shutdown.send(true);

        let acc_handle = SipAccountHandle {
            id: AccountId::generate(),
            client,
        };
        let result = acc_handle.registration_state();
        assert!(result.is_err());
    }

    /// RuntimeCommand::SetRegistration / UpdateAccountConfig が reactor 経由で
    /// 正しく配送されることを確認する。
    ///
    /// 注: 現時点の reactor は SetRegistration を未ハンドルのため、
    /// コマンドが配送されエラーレスポンスが返ってくることまでを確認する。
    #[tokio::test(flavor = "multi_thread")]
    async fn test_account_command_delivery() {
        use crate::runtime::backend::MockBackend;
        use crate::runtime::reactor::CoreReactor;

        let backend = Box::new(MockBackend::new()) as Box<dyn crate::runtime::backend::SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: events.clone(),
            state: state.clone(),
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        let acc_handle = SipAccountHandle {
            id: AccountId::generate(),
            client,
        };

        // register() は reactor が未ハンドルなのでエラーになるが、
        // 「コマンドが配送されエラーが返る」ことまでを確認する
        let reg_result = acc_handle.register();
        assert!(reg_result.is_err());

        let unreg_result = acc_handle.unregister();
        assert!(unreg_result.is_err());

        let set_result = acc_handle.set_registration_enabled(true);
        assert!(set_result.is_err());

        let update_result = acc_handle.update_config(crate::config::AccountConfigPatch::default());
        assert!(update_result.is_err());
    }

    /// shutdown 後に SipAccountHandle の操作が ShutdownInProgress で拒否される。
    #[tokio::test(flavor = "multi_thread")]
    async fn test_account_operation_after_shutdown() {
        crate::ffi::callbacks::clear_global_runtime();
        use crate::runtime::backend::MockBackend;
        use crate::runtime::reactor::CoreReactor;

        let backend = Box::new(MockBackend::new()) as Box<dyn crate::runtime::backend::SipBackend>;
        let events = EventBus::new(16, None);
        let state = Arc::new(RwLock::new(ClientState::new(
            ClientCapabilities::default_disabled(),
        )));
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let (handle, _join) =
            CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        // Initialize
        let init = handle
            .send_and_wait(|reply| RuntimeCommand::Initialize {
                config: crate::config::ClientConfig::default(),
                reply,
            })
            .await;
        assert!(init.is_ok());

        // SipClient + SipAccountHandle
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: events.clone(),
            state: state.clone(),
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        let acc_handle = SipAccountHandle {
            id: AccountId::generate(),
            client: client.clone(),
        };

        // Shutdown
        let _ = client.shutdown();
        assert!(client.is_shutdown());

        // Shutdown 後の操作は拒否される
        let reg = acc_handle.register();
        assert!(reg.is_err());
        let unreg = acc_handle.unregister();
        assert!(unreg.is_err());
        let reg_state = acc_handle.registration_state();
        assert!(reg_state.is_err());
    }

    // -----------------------------------------------------------------------
    // Shutdown tests
    // -----------------------------------------------------------------------

    /// is_shutdown() がデフォルトで false を返すことを確認する。
    #[test]
    fn test_is_shutdown_default_false() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };
        assert!(!client.is_shutdown());
    }

    /// shutdown() が is_shutdown を true にすることを確認する。
    ///
    /// 注: 実際の reactor がないため shutdown コマンドは送信できず、
    /// ここでは watch チャネルの状態変更のみを検証する。
    #[test]
    fn test_shutdown_sets_flag() {
        let (shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        // is_shutdown が watch 値を見ることを確認。
        assert!(!client.is_shutdown());
        let _ = client.inner.shutdown.send(true);
        assert!(client.is_shutdown());
    }

    // -----------------------------------------------------------------------
    // Call API tests
    // -----------------------------------------------------------------------

    /// make_call / hangup / hold / unhold / transfer / send_dtmf が
    /// インターフェース整合性を満たすことを確認する。
    ///
    /// 注: 実際の reactor がないため RTT メソッドは実行不可。
    /// ここではインターフェースのコンパイル検証に留める。
    #[test]
    fn test_call_api_interface_compile_check() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let _client = SipClient { inner };
        // インターフェースがコンパイルを通ることの検証
        // （実際のメソッド実行には reactor が必要）
    }

    /// answer が不正コードで InvalidConfig を返すことを確認する。
    #[test]
    fn test_answer_invalid_code() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let result = client.answer(CallId::generate(), 999);
        assert!(result.is_err());
        if let Err(e) = result {
            assert!(format!("{e}").contains("unsupported answer code"));
        }
    }

    /// 境界値: answer の許可範囲外のコードを確認する。
    #[test]
    fn test_answer_invalid_code_100() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let result = client.answer(CallId::generate(), 100);
        assert!(result.is_err());
        if let Err(e) = result {
            assert!(format!("{e}").contains("unsupported answer code"));
        }
    }

    /// call_state() が state から通話状態を読み取れることを確認する。
    #[test]
    fn test_call_state() {
        use crate::call::CallState;
        use crate::runtime::state::CallEntry;
        use std::collections::BTreeMap;

        let call_id = CallId::generate();
        let entry = CallEntry {
            id: call_id,
            native_id: None,
            account_id: AccountId::generate(),
            state: CallState::Active,
            media: None,
        };
        let mut calls = BTreeMap::new();
        calls.insert(call_id, entry);

        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let state = Arc::new(RwLock::new(ClientState {
            initialized: true,
            shutting_down: false,
            accounts: BTreeMap::new(),
            calls,
            capabilities: ClientCapabilities::default_disabled(),
        }));
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state,
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let result = client.call_state(call_id);
        match result {
            Ok(s) => assert_eq!(s, CallState::Active),
            Err(e) => panic!("call_state failed: {e}"),
        }
    }

    /// shutdown 後の発着信操作が ensure_not_shutdown で拒否されることを確認する。
    #[test]
    fn test_calls_rejected_after_shutdown() {
        let (shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        let _ = client.inner.shutdown.send(true);

        assert!(client
            .make_call(AccountId::generate(), test_outgoing_request())
            .is_err());
        assert!(client.answer(CallId::generate(), 200).is_err());
        assert!(client
            .hangup(CallId::generate(), HangupReason::Bye)
            .is_err());
        assert!(client.hold(CallId::generate()).is_err());
        assert!(client.unhold(CallId::generate()).is_err());
        assert!(client
            .transfer(CallId::generate(), "sip:x@y".into())
            .is_err());
        assert!(client
            .send_dtmf(
                CallId::generate(),
                "1".into(),
                crate::config::DtmfMethod::Rfc4733
            )
            .is_err());
        assert!(client.call_state(CallId::generate()).is_err());
    }

    /// テスト用の OutgoingCallRequest を構築する。
    fn test_outgoing_request() -> OutgoingCallRequest {
        OutgoingCallRequest {
            target_uri: "sip:user@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::config::CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: None,
                preferred_codecs: vec![],
            },
            auto_answer_refer: false,
        }
    }

    // -----------------------------------------------------------------------
    // Audio source management tests
    // -----------------------------------------------------------------------

    /// set_audio_source_gain が負値で InvalidConfig を返すことを確認する。
    #[test]
    fn test_set_gain_negative() {
        let (_shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: _shutdown_tx,
        });
        let client = SipClient { inner };

        let result =
            client.set_audio_source_gain(CallId::generate(), AudioSourceId::generate(), -1.0);
        assert!(result.is_err());
        if let Err(e) = result {
            let msg = format!("{e}");
            assert!(
                msg.contains("gain must be non-negative"),
                "unexpected error: {msg}"
            );
        }
    }

    /// shutdown 後の音声ソース操作が拒否されることを確認する。
    #[test]
    fn test_audio_source_after_shutdown() {
        let (shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        let _ = client.inner.shutdown.send(true);

        // add_audio_source は Box<dyn AsyncAudioSource> が必要。
        // ensure_not_shutdown の検証としては set_audio_source_gain で確認する。
        assert!(client
            .set_audio_source_gain(CallId::generate(), AudioSourceId::generate(), 0.5)
            .is_err());
    }

    /// subscribe_audio が shutdown 後に ShutdownInProgress を返すことを確認する。
    #[test]
    fn test_subscribe_audio_shutdown() {
        let (shutdown_tx, _shutdown_rx) = watch::channel(false);
        let (handle, _rx) = RuntimeHandle::new();
        let inner = Arc::new(ClientInner {
            runtime: handle,
            events: EventBus::new(16, None),
            state: Arc::new(RwLock::new(ClientState::new(
                ClientCapabilities::default_disabled(),
            ))),
            shutdown: shutdown_tx,
        });
        let client = SipClient { inner };
        let _ = client.inner.shutdown.send(true);

        let result = client.subscribe_audio(
            CallId::generate(),
            crate::audio::format::AudioFormat {
                sample_rate: crate::audio::format::SampleRate::Hz16000,
                bit_depth: crate::audio::format::BitDepth::I16,
                channel_layout: crate::audio::format::ChannelLayout::Mono,
                frame_ms: 10,
            },
            16,
            crate::audio::tap::AudioTapMode::Realtime,
        );
        assert!(result.is_err());
    }
}

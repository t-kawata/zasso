//! # SIP クライアント
//!
//! crate の公開APIのルートとなる `SipClient` 構造体を定義する。
//! RFC §8.2 に準拠。

use std::fmt;
use std::sync::Arc;

use tokio::sync::RwLock;

#[cfg(test)]
use tokio::sync::watch;
#[cfg(test)]
use crate::config::ClientConfig;
use crate::event::EventBus;
use crate::event::RawSipMessage;
use crate::event::SipEvent;
use crate::event::AccountEventReceiver;
#[cfg(test)]
use crate::event::{ConnectedCallInfo, SipEventPayload};
use crate::runtime::handle::RuntimeHandle;
use crate::runtime::state::ClientState;
use crate::util::id::AccountId;

#[cfg(test)]
use crate::event::ClientCapabilities;
#[cfg(test)]
use crate::runtime::backend::SipBackend;
#[cfg(test)]
use crate::runtime::command::RuntimeCommand;
#[cfg(test)]
use crate::runtime::reactor::CoreReactor;
#[cfg(test)]
use crate::config::validate_client_config;
#[cfg(test)]
use crate::error::SipError;

/// 現在の Tokio ランタイムハンドルを取得する。
/// ランタイム外で呼ばれた場合は新規作成する。
#[cfg(test)]
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
// M12-2 以降で使用。現在は未使用フィールドのため dead_code を許容。
#[allow(dead_code)]
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
    #[cfg(test)]
    pub(crate) fn new(config: ClientConfig, backend: Box<dyn SipBackend>) -> Result<Self, SipError> {
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
        let (handle, _join_handle) = CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx);

        // 6. Initialize コマンドを送信
        let init_result = block_on(handle.send_and_wait(|reply| {
            RuntimeCommand::Initialize {
                config: config.clone(),
                reply,
            }
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

    /// 制御系イベントを購読する。
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<SipEvent> {
        self.inner.events.subscribe_control()
    }

    /// RawSIP メッセージを購読する（無効時は `None`）。
    pub fn subscribe_raw_sip(&self) -> Option<tokio::sync::broadcast::Receiver<RawSipMessage>> {
        self.inner.events.subscribe_raw_sip()
    }

    /// 特定アカウントのイベントのみを購読する。
    pub fn subscribe_account(&self, account_id: AccountId) -> AccountEventReceiver {
        AccountEventReceiver::new(account_id, self.subscribe())
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
        let backend = Box::new(crate::runtime::backend::MockBackend::new());
        let config = ClientConfig::default();
        let client = SipClient::new(config, backend);
        assert!(client.is_ok());
    }

    /// event_bus_capacity < 16 で InvalidConfig エラー。
    #[test]
    fn test_new_invalid_config() {
        let backend = Box::new(crate::runtime::backend::MockBackend::new());
        let mut config = ClientConfig::default();
        config.event_bus_capacity = 0;
        let result = SipClient::new(config, backend);
        assert!(result.is_err());
    }

    /// MockBackend initialize 失敗 → エラーが伝播すること。
    #[test]
    fn test_new_initialize_failure() {
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
}

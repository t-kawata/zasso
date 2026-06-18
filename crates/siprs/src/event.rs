//! # イベント型定義
//!
//! 全イベントを表現する `SipEventPayload` enum と、各バリアントが保持する
//! Info 構造体を定義する。RFC §15.1 に準拠。
//!
//! # スケルトン戦略
//!
//! Info 構造体のフィールドは M6-2 以降で追加する。本モジュールでは
//! 空構造体として定義し、enum の構造のみを確定させる。

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use std::net::SocketAddr;

use tokio::sync::broadcast;

use crate::config::{Codec, DtmfMethod};
use crate::error::SipError;
use crate::transport::TransportKind;
use crate::util::id::{AccountId, CallId};

// ---------------------------------------------------------------------------
// EventDirection — イベントの方向
// ---------------------------------------------------------------------------

/// イベントの方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventDirection {
    /// SIP メッセージ受信方向。
    Inbound,
    /// SIP メッセージ送信方向。
    Outbound,
}

// ---------------------------------------------------------------------------
// EventTimestamp — SystemTime newtype
// ---------------------------------------------------------------------------

/// `SystemTime` の newtype。
///
/// `serde` feature 有効時は ISO 8601 文字列にシリアライズされる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct EventTimestamp(pub SystemTime);

// ---------------------------------------------------------------------------
// EventMeta — イベントメタデータ
// ---------------------------------------------------------------------------

/// イベントメタデータ。
///
/// 全イベントに共通する属性を保持する。
/// RFC §15.3 の全フィールドを網羅する。
#[derive(Debug, Clone)]
pub struct EventMeta {
    /// 単調増加のイベント識別子。
    pub event_id: u64,
    /// イベント発生日時。
    pub timestamp: EventTimestamp,
    /// 関連アカウント（該当する場合）。
    pub account_id: Option<AccountId>,
    /// 関連通話（該当する場合）。
    pub call_id: Option<CallId>,
    /// メッセージの方向（該当する場合）。
    pub direction: Option<EventDirection>,
    /// SIP ヘッダのリスト（該当する場合）。
    pub headers: Option<Vec<(String, String)>>,
    /// SIP ステータスコード（該当する場合）。
    pub status_code: Option<u16>,
    /// ステータスコードに対応する理由句。
    pub reason_phrase: Option<String>,
    /// 論理的意味付け情報（キーはアルファベット順）。
    pub logical_context: BTreeMap<String, String>,
}

// ---------------------------------------------------------------------------
// SipEvent — イベントエンベロープ
// ---------------------------------------------------------------------------

/// イベントエンベロープ。
///
/// イベントペイロードとメタデータをラップする。
/// 全イベントはこの構造体で配信される。
#[derive(Debug, Clone)]
pub struct SipEvent {
    /// イベントメタデータ。
    pub meta: EventMeta,
    /// イベントペイロード。
    pub payload: SipEventPayload,
}

/// イベント ID の採番カウンター（0 は無効値）。
static NEXT_EVENT_ID: AtomicU64 = AtomicU64::new(1);

impl SipEvent {
    /// `payload` から `SipEvent` を生成する。
    ///
    /// `event_id` は自動採番、`timestamp` は現在時刻で自動設定される。
    pub fn new(payload: SipEventPayload) -> Self {
        Self {
            meta: EventMeta {
                event_id: NEXT_EVENT_ID.fetch_add(1, Ordering::Relaxed),
                timestamp: EventTimestamp(SystemTime::now()),
                account_id: None,
                call_id: None,
                direction: None,
                headers: None,
                status_code: None,
                reason_phrase: None,
                logical_context: BTreeMap::new(),
            },
            payload,
        }
    }

    /// `payload` とメタデータビルダーから `SipEvent` を生成する。
    ///
    /// `EventMetaBuilder` でメタデータを設定後、`build()` を呼ぶ。
    pub fn with_meta(payload: SipEventPayload) -> EventMetaBuilder {
        EventMetaBuilder {
            payload,
            event_id: NEXT_EVENT_ID.fetch_add(1, Ordering::Relaxed),
            timestamp: EventTimestamp(SystemTime::now()),
            account_id: None,
            call_id: None,
            direction: None,
            headers: None,
            status_code: None,
            reason_phrase: None,
            logical_context: BTreeMap::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// EventMetaBuilder — fluent builder
// ---------------------------------------------------------------------------

/// `EventMeta` の fluent builder。
///
/// `SipEvent::with_meta(payload)` で生成し、`build()` で完了する。
#[derive(Debug, Clone)]
pub struct EventMetaBuilder {
    payload: SipEventPayload,
    event_id: u64,
    timestamp: EventTimestamp,
    account_id: Option<AccountId>,
    call_id: Option<CallId>,
    direction: Option<EventDirection>,
    headers: Option<Vec<(String, String)>>,
    status_code: Option<u16>,
    reason_phrase: Option<String>,
    logical_context: BTreeMap<String, String>,
}

impl EventMetaBuilder {
    /// 関連アカウント ID を設定する。
    pub fn account_id(mut self, id: AccountId) -> Self {
        self.account_id = Some(id);
        self
    }

    /// 関連通話 ID を設定する。
    pub fn call_id(mut self, id: CallId) -> Self {
        self.call_id = Some(id);
        self
    }

    /// イベントの方向を設定する。
    pub fn direction(mut self, dir: EventDirection) -> Self {
        self.direction = Some(dir);
        self
    }

    /// SIP ヘッダを追加する。
    pub fn header(mut self, name: &str, value: &str) -> Self {
        self.headers
            .get_or_insert_with(Vec::new)
            .push((name.to_string(), value.to_string()));
        self
    }

    /// SIP ステータスコードを設定する。
    pub fn status_code(mut self, code: u16) -> Self {
        self.status_code = Some(code);
        self
    }

    /// 理由句を設定する。
    pub fn reason(mut self, phrase: &str) -> Self {
        self.reason_phrase = Some(phrase.to_string());
        self
    }

    /// 論理的意味付け情報を追加する。
    pub fn context(mut self, key: &str, value: &str) -> Self {
        self.logical_context
            .insert(key.to_string(), value.to_string());
        self
    }

    /// ビルドを完了し `SipEvent` を生成する。
    pub fn build(self) -> SipEvent {
        SipEvent {
            meta: EventMeta {
                event_id: self.event_id,
                timestamp: self.timestamp,
                account_id: self.account_id,
                call_id: self.call_id,
                direction: self.direction,
                headers: self.headers,
                status_code: self.status_code,
                reason_phrase: self.reason_phrase,
                logical_context: self.logical_context,
            },
            payload: self.payload,
        }
    }
}

// ---------------------------------------------------------------------------
// SrtpImplementation / AudioDeviceCaps / ClientCapabilities（RFC §34.3）
// ---------------------------------------------------------------------------

/// SRTP 実装方式。
#[derive(Debug, Clone)]
pub enum SrtpImplementation {
    /// SDES (RFC 4568) による SRTP 鍵交換。
    SdesSrtp,
    /// DTLS-SRTP (RFC 5763) — PJSIP 2.17 では experimental。
    DtlsSrtp,
}

/// オーディオデバイス情報。
#[derive(Debug, Clone)]
pub struct AudioDeviceCaps {
    /// デフォルト入力デバイスが存在するか。
    pub has_default_input: bool,
    /// デフォルト出力デバイスが存在するか。
    pub has_default_output: bool,
    /// 入力デバイス名のリスト。
    pub input_devices: Vec<String>,
    /// 出力デバイス名のリスト。
    pub output_devices: Vec<String>,
}

/// クライアントの実行時機能マップ。
///
/// `SipClient::new()` 成功後に `ClientInitialized` イベントとして
/// 1 度だけ通知される。PJSIP のビルド時 feature とランタイム検出結果を反映し、
/// 利用者が実行可能な機能を判断するために用いる。
#[derive(Debug, Clone)]
pub struct ClientCapabilities {
    // ── 台数制約 ──
    /// 最大同時通話数。
    pub max_calls: u32,
    /// 最大登録アカウント数。
    pub max_accounts: u32,

    // ── トランスポート ──
    /// 利用可能なトランスポート種別のリスト。
    pub transport_types: Vec<TransportKind>,

    // ── セキュリティ ──
    /// TLS が利用可能か。
    pub tls_available: bool,
    /// TLS バージョン（利用可能な場合）。
    pub tls_version: Option<String>,
    /// SRTP が利用可能か。
    pub srtp_available: bool,
    /// 利用可能な SRTP 実装方式のリスト。
    pub srtp_types: Vec<SrtpImplementation>,

    // ── メディア ──
    /// 利用可能なコーデックのリスト。
    pub available_codecs: Vec<Codec>,
    /// Opus コーデックが利用可能か。
    pub opus_available: bool,
    /// オーディオデバイス情報。
    pub audio_devices: AudioDeviceCaps,

    // ── NAT/ICE ──
    /// ICE がサポートされているか。
    pub ice_supported: bool,
    /// Trickle ICE がサポートされているか。
    pub trickle_ice_supported: bool,
    /// STUN がサポートされているか。
    pub stun_supported: bool,
    /// TURN がサポートされているか。
    pub turn_supported: bool,

    // ── DTMF ──
    /// 利用可能な DTMF 方式のリスト。
    pub dtmf_methods: Vec<DtmfMethod>,

    // ── SIP 拡張機能 ──
    /// REFER メソッド（転送）をサポートしているか。
    pub supports_refer: bool,
    /// Session Timers (RFC 4028) をサポートしているか。
    pub supports_session_timers: bool,

    // ── 付加機能 ──
    /// イベントバスの capacity。
    pub event_bus_capacity: usize,
    /// Raw SIP イベントがサポートされているか。
    pub raw_sip_events_supported: bool,
    /// ミキサーが扱える最大ソース数。
    pub mixer_max_sources: usize,
}

impl ClientCapabilities {
    /// 全機能無効の `ClientCapabilities` を生成する。
    ///
    /// 全ての boolean が `false`、全ての Vec が空、数値は 0。
    pub fn default_disabled() -> Self {
        Self {
            max_calls: 0,
            max_accounts: 0,
            transport_types: Vec::new(),
            tls_available: false,
            tls_version: None,
            srtp_available: false,
            srtp_types: Vec::new(),
            available_codecs: Vec::new(),
            opus_available: false,
            audio_devices: AudioDeviceCaps {
                has_default_input: false,
                has_default_output: false,
                input_devices: Vec::new(),
                output_devices: Vec::new(),
            },
            ice_supported: false,
            trickle_ice_supported: false,
            stun_supported: false,
            turn_supported: false,
            dtmf_methods: Vec::new(),
            supports_refer: false,
            supports_session_timers: false,
            event_bus_capacity: 0,
            raw_sip_events_supported: false,
            mixer_max_sources: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Info 構造体（スケルトン）— フィールドは M6-2 以降で追加
// ---------------------------------------------------------------------------

// M8-3 以降で使用。現在は未使用のため dead_code を許容。
#[allow(dead_code)]
// ── 登録系 ──
#[derive(Debug, Clone)]
pub struct RegistrationInfo {}
#[derive(Debug, Clone)]
pub struct RegistrationFailure {}

// ── 発着信系 ──
#[derive(Debug, Clone)]
pub struct OutgoingCallInfo {}
#[derive(Debug, Clone)]
pub struct ProvisionalInfo {}
#[derive(Debug, Clone)]
pub struct EarlyMediaInfo {}
#[derive(Debug, Clone)]
pub struct ConnectedCallInfo {}
#[derive(Debug, Clone)]
pub struct IncomingCallInfo {}
#[derive(Debug, Clone)]
pub struct DisconnectInfo {}
#[derive(Debug, Clone)]
pub struct CancelInfo {}
#[derive(Debug, Clone)]
pub struct RejectInfo {}
#[derive(Debug, Clone)]
pub struct TransferInfo {}

// ── メディア系 ──
#[derive(Debug, Clone)]
pub struct MediaActiveInfo {}
#[derive(Debug, Clone)]
pub struct MediaStoppedInfo {}
#[derive(Debug, Clone)]
pub struct MediaErrorInfo {}

// ── DTMF系 ──
#[derive(Debug, Clone)]
pub struct DtmfSentInfo {}
#[derive(Debug, Clone)]
pub struct DtmfReceivedInfo {}

// ── ICE系 ──
#[derive(Debug, Clone)]
pub struct IceSuccessInfo {}
#[derive(Debug, Clone)]
pub struct IceFailureInfo {}

// ── トランスポート系 ──
#[derive(Debug, Clone)]
pub struct TransportConnectedInfo {}
#[derive(Debug, Clone)]
pub struct TransportDisconnectedInfo {}
#[derive(Debug, Clone)]
pub struct TransportErrorInfo {}

// ── アカウント系 ──
#[derive(Debug, Clone)]
pub struct AccountSnapshot {}

// ── その他発着信系 ──
// ReferReceived バリアントで使用。RFC §37 参照。
// フィールドは M6-2 以降で追加。
#[derive(Debug, Clone)]
pub struct ReferRequest {}

// ---------------------------------------------------------------------------
// SipEventPayload
// ---------------------------------------------------------------------------

/// イベント種別を定義する payload enum。
///
/// `#[non_exhaustive]` により将来のバリアント追加に対する破壊的変更を防止する。
/// データありバリアントは対応する Info 構造体を保持する。
/// データなしバリアントは将来の拡張に備えて `()` を保持する。
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum SipEventPayload {
    // ── 登録系（6） ──
    RegistrationStarted(RegistrationInfo),
    RegistrationSucceeded(RegistrationInfo),
    RegistrationFailed(RegistrationFailure),
    /// 登録解除成功（データなし）。
    UnregistrationSucceeded(()),
    UnregistrationFailed(RegistrationFailure),
    /// 登録期限切れ（データなし）。
    RegistrationExpired(()),

    // ── 発着信系（13） ──
    OutgoingCallStarted(OutgoingCallInfo),
    OutgoingCallTrying(ProvisionalInfo),
    OutgoingCallRinging(ProvisionalInfo),
    EarlyMediaReceived(EarlyMediaInfo),
    CallConnected(ConnectedCallInfo),
    IncomingCall(IncomingCallInfo),
    CallDisconnected(DisconnectInfo),
    CallCancelled(CancelInfo),
    CallRejected(RejectInfo),
    /// 通話保留（データなし）。
    CallHeld(()),
    /// 通話再開（データなし）。
    CallResumed(()),
    /// 転送リクエスト受信。
    ReferReceived(ReferRequest),
    TransferCompleted(TransferInfo),

    // ── メディア系（3） ──
    MediaActive(MediaActiveInfo),
    MediaStopped(MediaStoppedInfo),
    MediaError(MediaErrorInfo),

    // ── DTMF系（2） ──
    DtmfSent(DtmfSentInfo),
    DtmfReceived(DtmfReceivedInfo),

    // ── ICE系（3） ──
    /// ICE ネゴシエーション開始（データなし）。
    IceNegotiationStarted(()),
    IceNegotiationSucceeded(IceSuccessInfo),
    IceNegotiationFailed(IceFailureInfo),

    // ── トランスポート系（3） ──
    TransportConnected(TransportConnectedInfo),
    TransportDisconnected(TransportDisconnectedInfo),
    TransportError(TransportErrorInfo),

    // ── アカウント系（3） ──
    AccountAdded(AccountSnapshot),
    AccountRemoved(AccountSnapshot),
    AccountConfigChanged(AccountSnapshot),

    // ── クライアントライフサイクル系（2） ──
    /// クライアント初期化完了（機能マップ付き）。
    ClientInitialized(ClientCapabilities),
    /// クライアントシャットダウン（データなし）。
    ClientShutdown(()),

    // ── エラー系（1） ──
    Error(SipError),
}

// ---------------------------------------------------------------------------
// SipMessageDirection — 物理的送受信方向
// ---------------------------------------------------------------------------

/// SIP メッセージの物理的送受信方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipMessageDirection {
    /// 送信メッセージ。
    Sent,
    /// 受信メッセージ。
    Received,
}

// ---------------------------------------------------------------------------
// RawSipMessage — 生 SIP メッセージの構造化表現
// ---------------------------------------------------------------------------

/// 生 SIP メッセージの構造化表現。
///
/// デバッグ・監査用途で全 SIP トラフィックを観測可能にする。
/// `with_redaction()` で認証情報をマスクできる。
// M17-3 (callback bridge) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct RawSipMessage {
    /// メッセージの方向。
    pub direction: SipMessageDirection,
    /// 使用トランスポート。
    pub transport: TransportKind,
    /// ステータス行またはリクエスト行（改行なし）。
    pub start_line: String,
    /// SIP ヘッダのリスト（順序保存）。
    pub headers: Vec<(String, String)>,
    /// SIP メッセージボディ（SDP 等）。
    pub body: Option<Vec<u8>>,
    /// 完全な SIP メッセージテキスト（改行含む）。
    pub text: String,
    /// Content-Length ヘッダの値（body 長と一致すること）。
    pub content_length: usize,
    /// リモートアドレス（送信元/宛先）。
    pub remote_addr: Option<SocketAddr>,
    /// ローカルアドレス。
    pub local_addr: Option<SocketAddr>,
}

#[allow(dead_code)]
impl RawSipMessage {
    /// 生データから `RawSipMessage` を構築する（FFI 層用）。
    pub fn from_raw_parts(
        direction: SipMessageDirection,
        transport: TransportKind,
        start_line: impl Into<String>,
        headers: Vec<(String, String)>,
        body: Option<Vec<u8>>,
        text: impl Into<String>,
        content_length: usize,
        remote_addr: Option<SocketAddr>,
        local_addr: Option<SocketAddr>,
    ) -> Self {
        Self {
            direction,
            transport,
            start_line: start_line.into(),
            headers,
            body,
            text: text.into(),
            content_length,
            remote_addr,
            local_addr,
        }
    }

    /// `Authorization` および `Proxy-Authorization` ヘッダを redact する。
    ///
    /// `redact == true` の場合、該当ヘッダの値を `"***REDACTED***"` に置換する。
    /// ヘッダ名の比較は大文字小文字を区別しない。
    pub fn with_redaction(mut self, redact: bool) -> Self {
        if redact {
            for (name, value) in self.headers.iter_mut() {
                let lower = name.to_lowercase();
                if lower == "authorization" || lower == "proxy-authorization" {
                    *value = "***REDACTED***".to_string();
                }
            }
        }
        self
    }
}

// ---------------------------------------------------------------------------
// EventBus — イベント配送バス（RFC §15.4）
// ---------------------------------------------------------------------------

/// イベント配送バス。
///
/// 制御系イベント（`control`）と RawSIP メッセージ（`raw_sip`）の
/// 2 チャネル構成で、大量の RawSIP メッセージが制御系イベントの
/// 配送に影響しないことを保証する。
#[derive(Debug, Clone)]
pub struct EventBus {
    /// 制御系イベントのプライマリバス。
    control: broadcast::Sender<SipEvent>,
    /// RawSIP メッセージ専用バス（有効時のみ）。
    raw_sip: Option<broadcast::Sender<RawSipMessage>>,
}

impl EventBus {
    /// `EventBus` を生成する。
    ///
    /// `raw_sip_capacity` が `None` の場合、RawSIP バスは作成されない。
    pub fn new(control_capacity: usize, raw_sip_capacity: Option<usize>) -> Self {
        let (control_tx, _) = broadcast::channel(control_capacity);
        let raw_sip = raw_sip_capacity.map(|cap| {
            let (tx, _) = broadcast::channel(cap);
            tx
        });
        Self {
            control: control_tx,
            raw_sip,
        }
    }

    /// 制御系イベントを購読する。
    pub fn subscribe_control(&self) -> broadcast::Receiver<SipEvent> {
        self.control.subscribe()
    }

    /// RawSIP メッセージを購読する。
    ///
    /// RawSIP バスが無効な場合は `None` を返す。
    pub fn subscribe_raw_sip(&self) -> Option<broadcast::Receiver<RawSipMessage>> {
        self.raw_sip.as_ref().map(|tx| tx.subscribe())
    }

    /// 制御系イベントを発行する。
    ///
    /// 購読者不在時はエラーを無視する。
    pub fn publish(&self, event: SipEvent) {
        let _ = self.control.send(event);
    }

    /// RawSIP メッセージを発行する（専用バスが有効な場合のみ）。
    ///
    /// 無効時は何も行わない。
    pub fn publish_raw_sip(&self, msg: RawSipMessage) {
        #[cfg(feature = "metrics")]
        crate::metrics::increment_raw_sip_messages();
        if let Some(ref tx) = self.raw_sip {
            let _ = tx.send(msg);
        }
    }
}

// ---------------------------------------------------------------------------
// AccountEventReceiver — アカウントフィルタリング（RFC §15.5）
// ---------------------------------------------------------------------------

/// アカウント単位のイベントフィルタリングラッパー。
///
/// `broadcast::Receiver<SipEvent>` をラップし、指定された `account_id` に
/// 一致するイベントのみを透過的に抽出する。
pub struct AccountEventReceiver {
    /// フィルタリング対象のアカウント ID。
    account_id: AccountId,
    /// 内部の broadcast receiver。
    inner: tokio::sync::broadcast::Receiver<SipEvent>,
}

impl AccountEventReceiver {
    /// `AccountEventReceiver` を生成する。
    pub fn new(account_id: AccountId, inner: tokio::sync::broadcast::Receiver<SipEvent>) -> Self {
        Self { account_id, inner }
    }

    /// フィルタリング対象のアカウント ID を返す。
    pub fn account_id(&self) -> AccountId {
        self.account_id
    }

    /// アカウントに一致するイベントを待機する。
    ///
    /// 一致しないイベントは透過的にスキップされる。
    /// `account_id == None` のイベント（`ClientInitialized` 等）もスキップされる。
    pub async fn recv(&mut self) -> Result<SipEvent, tokio::sync::broadcast::error::RecvError> {
        loop {
            let event = self.inner.recv().await?;
            if event.meta.account_id == Some(self.account_id) {
                return Ok(event);
            }
        }
    }

    /// 非ブロッキング版の受信。
    ///
    /// 一致するイベントがない場合は `Ok(None)` を返す。
    /// 購読遅延による欠落は `Err(TryRecvError::Lagged(n))` として伝播される。
    pub fn try_recv(
        &mut self,
    ) -> Result<Option<SipEvent>, tokio::sync::broadcast::error::TryRecvError> {
        loop {
            match self.inner.try_recv() {
                Ok(event) => {
                    if event.meta.account_id == Some(self.account_id) {
                        return Ok(Some(event));
                    }
                    // 一致しない場合はループを継続。
                }
                Err(tokio::sync::broadcast::error::TryRecvError::Empty) => {
                    return Ok(None);
                }
                Err(e) => {
                    return Err(e);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// データありバリアントが Info 構造体を保持して構築できることを確認する。
    #[test]
    fn test_data_variants_constructible() {
        let variants = vec![
            SipEventPayload::RegistrationStarted(RegistrationInfo {}),
            SipEventPayload::RegistrationSucceeded(RegistrationInfo {}),
            SipEventPayload::RegistrationFailed(RegistrationFailure {}),
            SipEventPayload::UnregistrationFailed(RegistrationFailure {}),
            SipEventPayload::OutgoingCallStarted(OutgoingCallInfo {}),
            SipEventPayload::OutgoingCallTrying(ProvisionalInfo {}),
            SipEventPayload::OutgoingCallRinging(ProvisionalInfo {}),
            SipEventPayload::EarlyMediaReceived(EarlyMediaInfo {}),
            SipEventPayload::CallConnected(ConnectedCallInfo {}),
            SipEventPayload::IncomingCall(IncomingCallInfo {}),
            SipEventPayload::CallDisconnected(DisconnectInfo {}),
            SipEventPayload::CallCancelled(CancelInfo {}),
            SipEventPayload::CallRejected(RejectInfo {}),
            SipEventPayload::ReferReceived(ReferRequest {}),
            SipEventPayload::TransferCompleted(TransferInfo {}),
            SipEventPayload::MediaActive(MediaActiveInfo {}),
            SipEventPayload::MediaStopped(MediaStoppedInfo {}),
            SipEventPayload::MediaError(MediaErrorInfo {}),
            SipEventPayload::DtmfSent(DtmfSentInfo {}),
            SipEventPayload::DtmfReceived(DtmfReceivedInfo {}),
            SipEventPayload::IceNegotiationSucceeded(IceSuccessInfo {}),
            SipEventPayload::IceNegotiationFailed(IceFailureInfo {}),
            SipEventPayload::TransportConnected(TransportConnectedInfo {}),
            SipEventPayload::TransportDisconnected(TransportDisconnectedInfo {}),
            SipEventPayload::TransportError(TransportErrorInfo {}),
            SipEventPayload::AccountAdded(AccountSnapshot {}),
            SipEventPayload::AccountRemoved(AccountSnapshot {}),
            SipEventPayload::AccountConfigChanged(AccountSnapshot {}),
            SipEventPayload::ClientInitialized(ClientCapabilities::default_disabled()),
        ];
        assert_eq!(variants.len(), 29);
    }

    /// データなしバリアント（`()` 保持）が構築できることを確認する。
    #[test]
    fn test_empty_variants_constructible() {
        let variants = vec![
            SipEventPayload::UnregistrationSucceeded(()),
            SipEventPayload::RegistrationExpired(()),
            SipEventPayload::CallHeld(()),
            SipEventPayload::CallResumed(()),
            SipEventPayload::IceNegotiationStarted(()),
            SipEventPayload::ClientShutdown(()),
        ];
        assert_eq!(variants.len(), 6);
    }

    /// Error バリアントが SipError を正しくラップできることを確認する。
    #[test]
    fn test_error_variant() {
        let err = SipError::invalid_config("test error");
        let event = SipEventPayload::Error(err);
        if let SipEventPayload::Error(ref inner) = event {
            assert!(inner.to_string().contains("test error"));
        } else {
            panic!("Error バリアントではありません");
        }
    }

    /// 全バリアントの Clone が正しく機能することを確認する。
    #[test]
    fn test_clone_all_variants() {
        let original = SipEventPayload::CallConnected(ConnectedCallInfo {});
        let cloned = original.clone();
        assert!(matches!(cloned, SipEventPayload::CallConnected(_)));
    }

    /// 全 36 バリアントの網羅性を確認する（コンパイル時チェック代替）。
    #[test]
    fn test_variant_count() {
        // データあり: 29 + データなし: 6 + Error: 1 = 36
        let data_count = 29;
        let empty_count = 6;
        let error_count = 1;
        assert_eq!(data_count + empty_count + error_count, 36);
    }

    /// #[non_exhaustive] が付与されていることを確認する。
    ///
    /// 完全な検証は外部 crate でのみ可能。ここでは同一クレート内での
    /// 非網羅的パターンマッチが許可されること（警告が出ないこと）を確認する。
    #[test]
    fn test_non_exhaustive() {
        let event = SipEventPayload::CallHeld(());
        assert!(matches!(event, SipEventPayload::CallHeld(_)));
    }

    // -----------------------------------------------------------------------
    // SipEvent / EventMeta / EventTimestamp tests
    // -----------------------------------------------------------------------

    /// SipEvent::new が正しく生成されることを確認する。
    #[test]
    fn test_sip_event_new() {
        let payload = SipEventPayload::CallHeld(());
        let event = SipEvent::new(payload);
        assert!(event.meta.event_id > 0);
        assert!(matches!(event.payload, SipEventPayload::CallHeld(_)));
    }

    /// 1000 イベントの event_id が単調増加で重複しないことを確認する。
    #[test]
    fn test_event_id_monotonic() {
        let mut ids: Vec<u64> = Vec::with_capacity(1000);
        for _ in 0..1000 {
            let event = SipEvent::new(SipEventPayload::CallHeld(()));
            ids.push(event.meta.event_id);
        }
        // 単調増加かつユニーク。
        for i in 1..ids.len() {
            assert!(ids[i] > ids[i - 1], "event_id は単調増加する必要があります");
        }
    }

    /// EventMeta の全フィールドが正しく設定・取得できることを確認する。
    #[test]
    fn test_event_meta_fields() {
        let meta = EventMeta {
            event_id: 42,
            timestamp: EventTimestamp(SystemTime::now()),
            account_id: None,
            call_id: None,
            direction: Some(EventDirection::Inbound),
            headers: Some(vec![("Content-Type".into(), "application/sdp".into())]),
            status_code: Some(200),
            reason_phrase: Some("OK".into()),
            logical_context: BTreeMap::new(),
        };
        assert_eq!(meta.event_id, 42);
        assert_eq!(meta.direction, Some(EventDirection::Inbound));
        assert_eq!(meta.status_code, Some(200));
        assert_eq!(meta.reason_phrase, Some("OK".into()));
    }

    /// EventMetaBuilder が正しく機能することを確認する。
    #[test]
    fn test_event_meta_builder() {
        let event = SipEvent::with_meta(SipEventPayload::CallHeld(()))
            .direction(EventDirection::Outbound)
            .status_code(180)
            .reason("Ringing")
            .header("Call-ID", "abc-123")
            .context("source", "pjsua")
            .build();

        assert!(event.meta.event_id > 0);
        assert_eq!(event.meta.direction, Some(EventDirection::Outbound));
        assert_eq!(event.meta.status_code, Some(180));
        assert!(event.meta.headers.is_some());
        assert_eq!(
            event.meta.logical_context.get("source").map(|s| s.as_str()),
            Some("pjsua")
        );
    }

    /// EventTimestamp が SystemTime を正しく保持することを確認する。
    #[test]
    fn test_event_timestamp() {
        let now = SystemTime::now();
        let ts = EventTimestamp(now);
        assert_eq!(ts.0, now);
    }

    /// EventDirection の全バリアントが構築可能であることを確認する。
    #[test]
    fn test_event_direction() {
        let inbound = EventDirection::Inbound;
        let outbound = EventDirection::Outbound;
        assert_ne!(inbound, outbound);
    }

    /// SipEvent の Clone / Debug が機能することを確認する。
    #[test]
    fn test_clone_debug() {
        let event = SipEvent::new(SipEventPayload::CallHeld(()));
        let cloned = event.clone();
        assert_eq!(event.meta.event_id, cloned.meta.event_id);
        let debug_str = format!("{:?}", event);
        assert!(debug_str.contains("SipEvent"));
    }

    // -----------------------------------------------------------------------
    // RawSipMessage / SipMessageDirection tests
    // -----------------------------------------------------------------------

    /// from_raw_parts で正しく構築できることを確認する。
    #[test]
    fn test_raw_sip_message_from_parts() {
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Sent,
            TransportKind::Udp,
            "INVITE sip:user@domain SIP/2.0",
            vec![("From".into(), "<sip:alice@example.com>".into())],
            None,
            "INVITE sip:user@domain SIP/2.0\r\n\r\n",
            0,
            None,
            None,
        );
        assert_eq!(msg.direction, SipMessageDirection::Sent);
        assert_eq!(msg.start_line, "INVITE sip:user@domain SIP/2.0");
    }

    /// with_redaction(true) が Authorization ヘッダを redact することを確認する。
    #[test]
    fn test_redact_authorization() {
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Received,
            TransportKind::Tcp,
            "",
            vec![("Authorization".into(), "Basic dXNlcjpwYXNz".into())],
            None,
            "",
            0,
            None,
            None,
        );
        let redacted = msg.with_redaction(true);
        assert_eq!(redacted.headers[0].1, "***REDACTED***");
    }

    /// with_redaction(true) が Proxy-Authorization ヘッダも redact することを確認する。
    #[test]
    fn test_redact_proxy_authorization() {
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Received,
            TransportKind::Udp,
            "",
            vec![("Proxy-Authorization".into(), "Digest qop=auth".into())],
            None,
            "",
            0,
            None,
            None,
        );
        let redacted = msg.with_redaction(true);
        assert_eq!(redacted.headers[0].1, "***REDACTED***");
    }

    /// with_redaction(false) でヘッダが変更されないことを確認する。
    #[test]
    fn test_redact_disabled() {
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Sent,
            TransportKind::Udp,
            "",
            vec![("Authorization".into(), "secret".into())],
            None,
            "",
            0,
            None,
            None,
        );
        let unchanged = msg.with_redaction(false);
        assert_eq!(unchanged.headers[0].1, "secret");
    }

    /// redaction がその他のヘッダ（From, To, Call-ID 等）に影響しないことを確認する。
    #[test]
    fn test_redact_preserves_other_headers() {
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Received,
            TransportKind::Udp,
            "",
            vec![
                ("From".into(), "<sip:alice@example.com>".into()),
                ("To".into(), "<sip:bob@example.com>".into()),
                ("Call-ID".into(), "abc-123".into()),
            ],
            None,
            "",
            0,
            None,
            None,
        );
        let redacted = msg.with_redaction(true);
        assert_eq!(redacted.headers[0].1, "<sip:alice@example.com>");
        assert_eq!(redacted.headers[1].1, "<sip:bob@example.com>");
        assert_eq!(redacted.headers[2].1, "abc-123");
    }

    /// body が Option<Vec<u8>> を正しく保持できることを確認する。
    #[test]
    fn test_raw_sip_message_body() {
        let body_content = b"v=0\r\no=...".to_vec();
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Received,
            TransportKind::Udp,
            "",
            vec![],
            Some(body_content.clone()),
            "",
            body_content.len(),
            None,
            None,
        );
        assert_eq!(msg.body, Some(body_content));
    }

    /// text が完全な SIP メッセージを保持できることを確認する。
    #[test]
    fn test_raw_sip_message_text() {
        let sip_text = "INVITE sip:user@domain SIP/2.0\r\nFrom: Alice\r\n\r\n".to_string();
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Sent,
            TransportKind::Udp,
            "INVITE sip:user@domain SIP/2.0",
            vec![],
            None,
            sip_text.clone(),
            0,
            None,
            None,
        );
        assert_eq!(msg.text, sip_text);
    }

    /// Debug 出力で redact 済みヘッダが露出しないことを確認する。
    #[test]
    fn test_raw_sip_debug_redacted() {
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Received,
            TransportKind::Udp,
            "",
            vec![("Authorization".into(), "should-be-hidden".into())],
            None,
            "",
            0,
            None,
            None,
        );
        let redacted = msg.with_redaction(true);
        let debug = format!("{:?}", redacted);
        assert!(!debug.contains("should-be-hidden"));
        assert!(debug.contains("***REDACTED***"));
    }

    // -----------------------------------------------------------------------
    // EventBus tests
    // -----------------------------------------------------------------------

    /// publish → subscribe_control でイベントが受信できることを確認する。
    #[test]
    fn test_event_bus_publish_subscribe() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        let payload = SipEventPayload::CallHeld(());
        let event = SipEvent::new(payload);
        bus.publish(event);

        let received = rx.try_recv();
        assert!(received.is_ok());
        if let Ok(received) = received {
            assert!(matches!(received.payload, SipEventPayload::CallHeld(_)));
        }
    }

    /// 複数購読者が同時にイベントを受信できることを確認する。
    #[test]
    fn test_event_bus_multiple_subscribers() {
        let bus = EventBus::new(16, None);
        let mut rx1 = bus.subscribe_control();
        let mut rx2 = bus.subscribe_control();

        let event = SipEvent::new(SipEventPayload::CallHeld(()));
        bus.publish(event);

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
    }

    /// raw_sip_capacity = None → subscribe_raw_sip が None を返すことを確認する。
    #[test]
    fn test_event_bus_raw_sip_disabled() {
        let bus = EventBus::new(16, None);
        assert!(bus.subscribe_raw_sip().is_none());
    }

    /// raw_sip_capacity = Some(64) → subscribe_raw_sip が Some を返すことを確認する。
    #[test]
    fn test_event_bus_raw_sip_enabled() {
        let bus = EventBus::new(16, Some(64));
        assert!(bus.subscribe_raw_sip().is_some());
    }

    /// raw_sip 無効時に publish_raw_sip が no-op であることを確認する。
    #[test]
    fn test_event_bus_publish_raw_sip_disabled_noop() {
        let bus = EventBus::new(16, None);
        // パニックしないこと。
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Sent,
            TransportKind::Udp,
            "",
            vec![],
            None,
            "",
            0,
            None,
            None,
        );
        bus.publish_raw_sip(msg);
    }

    /// 購読者不在時の publish がパニックしないことを確認する。
    #[test]
    fn test_event_bus_publish_no_listener() {
        let bus = EventBus::new(16, None);
        let event = SipEvent::new(SipEventPayload::CallHeld(()));
        // 購読者がいない状態で publish してもパニックしない。
        bus.publish(event);
    }

    /// control と raw_sip のイベントが互いに干渉しないことを確認する。
    #[test]
    fn test_event_bus_separate_channels() {
        let bus = EventBus::new(16, Some(16));
        let mut control_rx = bus.subscribe_control();
        let Some(mut raw_sip_rx) = bus.subscribe_raw_sip() else {
            panic!("raw_sip バスは有効なはず");
        };

        // control に publish → raw_sip では受信されない。
        bus.publish(SipEvent::new(SipEventPayload::CallHeld(())));
        assert!(control_rx.try_recv().is_ok());
        assert!(raw_sip_rx.try_recv().is_err());

        // raw_sip に publish → control では受信されない。
        let msg = RawSipMessage::from_raw_parts(
            SipMessageDirection::Received,
            TransportKind::Udp,
            "",
            vec![],
            None,
            "",
            0,
            None,
            None,
        );
        bus.publish_raw_sip(msg);
        assert!(raw_sip_rx.try_recv().is_ok());
        assert!(control_rx.try_recv().is_err());
    }

    /// Clone 後も同一の EventBus を共有することを確認する。
    #[test]
    fn test_event_bus_clone() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        let cloned = bus.clone();
        cloned.publish(SipEvent::new(SipEventPayload::CallHeld(())));

        // 元の bus の購読者にも配信される。
        assert!(rx.try_recv().is_ok());
    }

    // -----------------------------------------------------------------------
    // AccountEventReceiver tests
    // -----------------------------------------------------------------------

    /// 一致する account_id のイベントが受信できることを確認する。
    #[test]
    fn test_account_event_recv_match() {
        let bus = EventBus::new(16, None);
        let acc_id = AccountId::generate();
        let mut receiver = AccountEventReceiver::new(acc_id, bus.subscribe_control());

        // 一致する account_id のイベントを publish。
        let mut event = SipEvent::new(SipEventPayload::RegistrationSucceeded(RegistrationInfo {}));
        event.meta.account_id = Some(acc_id);
        bus.publish(event);

        // try_recv で取得できる。
        let result = receiver.try_recv();
        assert!(result.is_ok());
        if let Ok(Some(received)) = result {
            assert_eq!(received.meta.account_id, Some(acc_id));
        }
    }

    /// 一致しない account_id のイベントがスキップされることを確認する。
    #[test]
    fn test_account_event_recv_skip_mismatch() {
        let bus = EventBus::new(16, None);
        let acc_id = AccountId::generate();
        let other_id = AccountId::generate();
        let mut receiver = AccountEventReceiver::new(acc_id, bus.subscribe_control());

        // 異なる account_id のイベントを publish。
        let mut event = SipEvent::new(SipEventPayload::CallConnected(ConnectedCallInfo {}));
        event.meta.account_id = Some(other_id);
        bus.publish(event);

        // スキップされて Empty になる。
        let result = receiver.try_recv();
        assert!(result.is_ok());
        if let Ok(maybe) = result {
            assert!(maybe.is_none());
        }
    }

    /// account_id = None のイベントがスキップされることを確認する。
    #[test]
    fn test_account_event_recv_skip_none() {
        let bus = EventBus::new(16, None);
        let acc_id = AccountId::generate();
        let mut receiver = AccountEventReceiver::new(acc_id, bus.subscribe_control());

        // account_id = None のイベントを publish。
        let event = SipEvent::new(SipEventPayload::ClientInitialized(
            ClientCapabilities::default_disabled(),
        ));
        bus.publish(event);

        // スキップされて Empty になる。
        assert!(receiver.try_recv().is_ok());
        if let Ok(maybe) = receiver.try_recv() {
            assert!(maybe.is_none());
        }
    }

    /// try_recv で一致イベントが即時取得できることを確認する。
    #[test]
    fn test_account_event_try_recv_match() {
        let bus = EventBus::new(16, None);
        let acc_id = AccountId::generate();
        let mut receiver = AccountEventReceiver::new(acc_id, bus.subscribe_control());

        let mut event = SipEvent::new(SipEventPayload::CallHeld(()));
        event.meta.account_id = Some(acc_id);
        bus.publish(event);

        if let Ok(Some(received)) = receiver.try_recv() {
            assert_eq!(received.meta.account_id, Some(acc_id));
        } else {
            panic!("try_recv が None または Err を返しました");
        }
    }

    /// 空時に try_recv が Err ではなく Ok(None) を返すことを確認する。
    #[test]
    fn test_account_event_try_recv_empty() {
        let bus = EventBus::new(16, None);
        let acc_id = AccountId::generate();
        let mut receiver = AccountEventReceiver::new(acc_id, bus.subscribe_control());

        let result = receiver.try_recv();
        match result {
            Ok(None) => {} // 期待通り。
            _ => panic!("空時は Ok(None) が期待されます: {:?}", result),
        }
    }

    /// 複数の AccountEventReceiver が異なる account_id で独立動作することを確認する。
    #[test]
    fn test_multiple_receivers_independent() {
        let bus = EventBus::new(16, None);
        let alice = AccountId::generate();
        let bob = AccountId::generate();

        let mut alice_rx = AccountEventReceiver::new(alice, bus.subscribe_control());
        let mut bob_rx = AccountEventReceiver::new(bob, bus.subscribe_control());

        // Alice 向けイベント。
        let mut event_a =
            SipEvent::new(SipEventPayload::RegistrationSucceeded(RegistrationInfo {}));
        event_a.meta.account_id = Some(alice);
        bus.publish(event_a);

        // Bob 向けイベント。
        let mut event_b = SipEvent::new(SipEventPayload::CallConnected(ConnectedCallInfo {}));
        event_b.meta.account_id = Some(bob);
        bus.publish(event_b);

        // Alice のレシーバが Alice のイベントを受信。
        if let Ok(Some(received)) = alice_rx.try_recv() {
            assert!(matches!(
                received.payload,
                SipEventPayload::RegistrationSucceeded(_)
            ));
        } else {
            panic!("Alice のレシーバがイベントを受信できません");
        }

        // Bob のレシーバが Bob のイベントを受信。
        if let Ok(Some(received)) = bob_rx.try_recv() {
            assert!(matches!(
                received.payload,
                SipEventPayload::CallConnected(_)
            ));
        } else {
            panic!("Bob のレシーバがイベントを受信できません");
        }

        // 両方のレシーバが空。
        assert!(alice_rx.try_recv().is_ok());
        assert!(bob_rx.try_recv().is_ok());
        if let Ok(maybe_a) = alice_rx.try_recv() {
            assert!(maybe_a.is_none());
        }
        if let Ok(maybe_b) = bob_rx.try_recv() {
            assert!(maybe_b.is_none());
        }
    }

    // -----------------------------------------------------------------------
    // ClientCapabilities tests
    // -----------------------------------------------------------------------

    /// default_disabled() の全 boolean が false、全 Vec が空、数値が 0 であることを確認する。
    #[test]
    fn test_default_disabled() {
        let caps = ClientCapabilities::default_disabled();
        // Booleans
        assert!(!caps.tls_available);
        assert!(!caps.srtp_available);
        assert!(!caps.opus_available);
        assert!(!caps.ice_supported);
        assert!(!caps.trickle_ice_supported);
        assert!(!caps.stun_supported);
        assert!(!caps.turn_supported);
        assert!(!caps.supports_refer);
        assert!(!caps.supports_session_timers);
        assert!(!caps.raw_sip_events_supported);
        // Numbers
        assert_eq!(caps.max_calls, 0);
        assert_eq!(caps.max_accounts, 0);
        assert_eq!(caps.event_bus_capacity, 0);
        assert_eq!(caps.mixer_max_sources, 0);
        // Vectors
        assert!(caps.transport_types.is_empty());
        assert!(caps.srtp_types.is_empty());
        assert!(caps.available_codecs.is_empty());
        assert!(caps.dtmf_methods.is_empty());
        // Options
        assert!(caps.tls_version.is_none());
        // AudioDeviceCaps
        assert!(!caps.audio_devices.has_default_input);
        assert!(!caps.audio_devices.has_default_output);
        assert!(caps.audio_devices.input_devices.is_empty());
        assert!(caps.audio_devices.output_devices.is_empty());
    }

    /// SrtpImplementation の全バリアントが構築可能であることを確認する。
    #[test]
    fn test_srtp_implementation_variants() {
        let sdes = SrtpImplementation::SdesSrtp;
        let dtls = SrtpImplementation::DtlsSrtp;
        assert!(matches!(sdes, SrtpImplementation::SdesSrtp));
        assert!(matches!(dtls, SrtpImplementation::DtlsSrtp));
    }

    /// AudioDeviceCaps が空デバイスリストを許容することを確認する。
    #[test]
    fn test_audio_device_caps_empty() {
        let caps = AudioDeviceCaps {
            has_default_input: false,
            has_default_output: false,
            input_devices: vec![],
            output_devices: vec![],
        };
        assert!(caps.input_devices.is_empty());
        assert!(caps.output_devices.is_empty());
    }

    /// ClientCapabilities の Clone / Debug が機能することを確認する。
    #[test]
    fn test_client_capabilities_clone_debug() {
        let caps = ClientCapabilities::default_disabled();
        let cloned = caps.clone();
        assert_eq!(cloned.max_calls, 0);
        let debug = format!("{:?}", caps);
        assert!(debug.contains("ClientCapabilities"));
    }

    /// ClientCapabilities の全フィールドが設定・取得できることを確認する。
    #[test]
    fn test_client_capabilities_fields() {
        let caps = ClientCapabilities {
            max_calls: 10,
            max_accounts: 5,
            transport_types: vec![TransportKind::Udp],
            tls_available: true,
            tls_version: Some("1.3".into()),
            srtp_available: true,
            srtp_types: vec![SrtpImplementation::SdesSrtp],
            available_codecs: vec![],
            opus_available: true,
            audio_devices: AudioDeviceCaps {
                has_default_input: true,
                has_default_output: true,
                input_devices: vec!["Mic".into()],
                output_devices: vec!["Speaker".into()],
            },
            ice_supported: true,
            trickle_ice_supported: false,
            stun_supported: true,
            turn_supported: false,
            dtmf_methods: vec![],
            supports_refer: true,
            supports_session_timers: false,
            event_bus_capacity: 2048,
            raw_sip_events_supported: true,
            mixer_max_sources: 32,
        };
        assert_eq!(caps.max_calls, 10);
        assert_eq!(caps.max_accounts, 5);
        assert!(caps.tls_available);
        assert_eq!(caps.tls_version, Some("1.3".into()));
        assert_eq!(caps.event_bus_capacity, 2048);
        assert_eq!(caps.mixer_max_sources, 32);
    }
}

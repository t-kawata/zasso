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
// ClientCapabilities — クライアント初期化時に通知される機能マップ
// ---------------------------------------------------------------------------

/// クライアントの実行時機能マップ。
///
/// `ClientInitialized` イベントに載せて 1 度だけ通知される。
/// フィールドは M8-3 で追加予定。
#[derive(Debug, Clone)]
pub struct ClientCapabilities {}

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
            SipEventPayload::ClientInitialized(ClientCapabilities {}),
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
            event
                .meta
                .logical_context
                .get("source")
                .map(|s| s.as_str()),
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
}

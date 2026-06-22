//! # ランタイムコマンド
//!
//! 全公開 API 呼び出しを reactor スレッド上にシリアライズするための
//! コマンド型 `RuntimeCommand` を定義する。RFC §7.2 に準拠。
//!
//! M11-2 (RuntimeHandle) 以降で使用。現在は未使用のため dead_code を許容。
#![allow(dead_code)]

use crate::config::{
    AccountConfig, AccountConfigPatch, ClientConfig, DtmfMethod, OutgoingCallRequest,
};
use crate::error::SipError;
use crate::ffi::callbacks::NativeEvent;
use crate::util::id::{AccountId, AudioSourceId, CallId};

/// メディアフローの方向。
///
/// カンファレンス接続（ConfConnect / ConfDisconnect）において、
/// どの方向のメディアストリームを操作するかを指定する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MediaDirection {
    /// 着信方向（相手→自分）のメディア。
    Inbound,
    /// 発信方向（自分→相手）のメディア。
    Outbound,
    /// 双方向メディア。
    Both,
}

/// アカウント情報のスナップショット。
///
/// PJSIP の `pjsua_acc_info` 構造体の safe Rust 版。
/// RegistrationStateChanged 変換（M20-4）で使用される。
#[derive(Debug, Clone)]
pub(crate) struct AccountInfoSnapshot {
    /// アカウント ID。
    pub acc_id: AccountId,
    /// SIP 登録ステータスコード。
    pub registration_status: u16,
    /// 登録有効期限（秒）。未登録時は None。
    pub registration_expires: Option<u32>,
    /// オンラインステータス。
    pub online_status: bool,
    /// アカウント URI。
    pub uri: String,
}

/// 切断理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HangupReason {
    /// BYE による正常切断。
    Bye,
    /// CANCEL による切断。
    Cancel,
    /// 相手先ビジー。
    Busy,
    /// 着信拒否。
    Decline,
    /// 内部エラーによる切断。
    InternalError,
}

/// Reactor に送信するランタイムコマンド。
///
/// 全公開 API はこの enum に変換され、unbounded MPSC 経由で
/// reactor スレッドに送られる。処理結果は oneshot で返送される。
pub(crate) enum RuntimeCommand {
    /// PJSUA 初期化。
    Initialize {
        config: ClientConfig,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// SIP アカウント追加。
    AddAccount {
        account_id: AccountId,
        config: AccountConfig,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// SIP アカウント削除。
    RemoveAccount {
        account_id: AccountId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 登録有効/無効設定。
    SetRegistration {
        account_id: AccountId,
        enabled: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// アカウント設定更新。
    UpdateAccountConfig {
        account_id: AccountId,
        patch: AccountConfigPatch,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 発信。
    MakeCall {
        account_id: AccountId,
        request: Box<OutgoingCallRequest>,
        reply: tokio::sync::oneshot::Sender<Result<CallId, SipError>>,
    },
    /// 切断。
    Hangup {
        call_id: CallId,
        reason: HangupReason,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 保留。
    Hold {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 保留解除。
    Unhold {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// DTMF 送信。
    SendDtmf {
        call_id: CallId,
        digits: String,
        method: DtmfMethod,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 着信応答。
    Answer {
        call_id: CallId,
        code: u16,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 転送。
    Transfer {
        call_id: CallId,
        target: String,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 音声ソース追加。
    AddAudioSource {
        call_id: CallId,
        source: Box<dyn crate::audio::source::ErasedAudioSource>,
        reply: tokio::sync::oneshot::Sender<Result<AudioSourceId, SipError>>,
    },
    /// 音声ソース削除。
    RemoveAudioSource {
        call_id: CallId,
        source_id: AudioSourceId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 音声ソースゲイン設定。
    SetSourceGain {
        call_id: CallId,
        source_id: AudioSourceId,
        gain: f32,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 音声ソースミュート設定。
    MuteSource {
        call_id: CallId,
        source_id: AudioSourceId,
        muted: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// 音声購読。
    SubscribeAudio {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// シャットダウン。
    Shutdown {
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// アカウント情報取得（読み取り専用、Shutdown 中も許可）。
    GetAccountInfo {
        native_acc_id: i32,
        reply_tx: tokio::sync::oneshot::Sender<Result<AccountInfoSnapshot, SipError>>,
    },
    /// カンファレンス接続。
    ConfConnect {
        call_id: CallId,
        media_direction: MediaDirection,
        reply_tx: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// カンファレンス切断。
    ConfDisconnect {
        call_id: CallId,
        media_direction: MediaDirection,
        reply_tx: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    /// PJSIP callback からの内部イベント（fire-and-forget、reply なし）。
    NativeEvent {
        event: NativeEvent,
    },
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::id::AccountId;

    /// RuntimeCommand が Send を満たすことを確認する。
    #[test]
    fn test_runtime_command_send() {
        fn assert_send<T: Send>() {}
        assert_send::<RuntimeCommand>();
    }

    /// HangupReason の全バリアントが構築可能であることを確認する。
    #[test]
    fn test_hangup_reason_variants() {
        let _bye = HangupReason::Bye;
        let _cancel = HangupReason::Cancel;
        let _busy = HangupReason::Busy;
        let _decline = HangupReason::Decline;
        let _internal = HangupReason::InternalError;
    }

    /// MediaDirection の全バリアントが構築可能であることを確認する。
    #[test]
    fn test_media_direction_variants() {
        let _inbound = MediaDirection::Inbound;
        let _outbound = MediaDirection::Outbound;
        let _both = MediaDirection::Both;
    }

    /// MediaDirection が Send を満たすことを確認する。
    #[test]
    fn test_media_direction_send() {
        fn assert_send<T: Send>() {}
        assert_send::<MediaDirection>();
    }

    /// AccountInfoSnapshot の全フィールドが構築可能であることを確認する。
    #[test]
    fn test_account_info_snapshot_fields() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId::from_test(1),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:user@example.com".into(),
        };
        assert_eq!(snapshot.registration_status, 200);
        assert_eq!(snapshot.uri, "sip:user@example.com");
        assert!(snapshot.online_status);
    }

    /// AccountInfoSnapshot が Send を満たすことを確認する。
    #[test]
    fn test_account_info_snapshot_send() {
        fn assert_send<T: Send>() {}
        assert_send::<AccountInfoSnapshot>();
    }
}

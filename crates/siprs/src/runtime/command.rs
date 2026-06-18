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
use crate::util::id::{AccountId, AudioSourceId, CallId};

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
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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
}

//! # エラー型 — crate 統一エラー基盤
//!
//! すべての公開 API は `Result<T, SipError>` を返す。
//! RFC §14 および §14.1 に基づき、stable なエラー分類・リカバリ可能性・ネイティブエラーコードを保持する。
//!
//! ## エラー変換方針（RFC §14.1）
//!
//! - `pj_status_t != PJ_SUCCESS` は必ず `NativeError` または文脈特化エラーへ変換する
//! - 4xx/5xx/6xx は SIP 応答コードを `InviteFailed` / `RegistrationFailed` の message に格納する
//! - callback 内 panic は `catch_unwind` で握り潰さず `InternalInvariantBroken` を emit し、対象 call/account を安全停止する

use std::fmt::{self, Display};
use thiserror::Error;

use crate::util::id::{AccountId, CallId};

// ---------------------------------------------------------------------------
// SipErrorKind — エラー種別（23 バリアント）
// ---------------------------------------------------------------------------

/// エラー種別を分類する stable な列挙型。
///
/// この enum はプログラム的なエラー種別判別を提供する。
/// `SipError::retryable` フラグと組み合わせてリカバリ戦略の決定に使用する。
///
/// # 設計意図
///
/// 各バリアントは SIP クライアントの運用で発生しうる全エラーカテゴリをカバーする。
/// 利用者は match でエラー種別を判別し、適切なフォールバック処理を実装できる。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipErrorKind {
    /// 設定値のバリデーションエラー（リトライ不可）。
    InvalidConfig,
    /// 状態遷移違反（状態が変化すればリトライ成功しうる）。
    InvalidState,
    /// 二重初期化（リトライ可能: 初期化済み状態を待つ）。
    AlreadyInitialized,
    /// 未初期化状態での操作（リトライ可能: 初期化後に再試行）。
    NotInitialized,
    /// アカウント不在（リトライ不可: アカウント ID が存在しない）。
    AccountNotFound,
    /// 通話不在（リトライ不可: 通話 ID が存在しない）。
    CallNotFound,
    /// トランスポート初期化失敗（リトライ可能: バインドアドレス競合等）。
    TransportInitFailed,
    /// SIP REGISTER 失敗（リトライ可能: ネットワーク一時障害等）。
    RegistrationFailed,
    /// 認証失敗（リトライ不可: クレデンシャルが不変のため）。
    AuthenticationFailed,
    /// INVITE 失敗（リトライ可能: 相手先一時不在等）。
    InviteFailed,
    /// メディア初期化失敗（リトライ可能: コーデックリソース競合等）。
    MediaInitFailed,
    /// メディアネゴシエーション失敗（リトライ可能: コーデック不一致等）。
    MediaNegotiationFailed,
    /// ICE ネゴシエーション失敗（リトライ可能: STUN サーバ一時不通等）。
    IceFailed,
    /// TLS 接続失敗（リトライ不可: 証明書・設定が不変のため）。
    TlsFailed,
    /// SRTP 初期化失敗（リトライ不可: 鍵・ポリシー設定が不変のため）。
    SrtpFailed,
    /// 非対応オーディオフォーマット（リトライ不可: フォーマット不変のため）。
    AudioFormatUnsupported,
    /// 音声パイプライン異常（リトライ可能: 再初期化で回復しうる）。
    AudioPipelineBroken,
    /// DTMF 送受信失敗（リトライ可能: シグナリング再試行可能）。
    DtmfFailed,
    /// タイムアウト（リトライ可能: ネットワーク回復後に成功しうる）。
    Timeout,
    /// イベントチャネル閉鎖（リトライ不可: チャネルインスタンスは再利用不可）。
    ChannelClosed,
    /// PJSIP ネイティブエラー（リトライ可能: ネイティブ状態が回復しうる）。
    NativeError,
    /// シャットダウン中（リトライ不可: クライアント終了中は操作不能）。
    ShutdownInProgress,
    /// 内部不変条件違反（リトライ不可: バグでありコード修正が必要）。
    InternalInvariantBroken,
}

// ---------------------------------------------------------------------------
// Display — SipErrorKind
// ---------------------------------------------------------------------------

impl Display for SipErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig => write!(f, "InvalidConfig"),
            Self::InvalidState => write!(f, "InvalidState"),
            Self::AlreadyInitialized => write!(f, "AlreadyInitialized"),
            Self::NotInitialized => write!(f, "NotInitialized"),
            Self::AccountNotFound => write!(f, "AccountNotFound"),
            Self::CallNotFound => write!(f, "CallNotFound"),
            Self::TransportInitFailed => write!(f, "TransportInitFailed"),
            Self::RegistrationFailed => write!(f, "RegistrationFailed"),
            Self::AuthenticationFailed => write!(f, "AuthenticationFailed"),
            Self::InviteFailed => write!(f, "InviteFailed"),
            Self::MediaInitFailed => write!(f, "MediaInitFailed"),
            Self::MediaNegotiationFailed => write!(f, "MediaNegotiationFailed"),
            Self::IceFailed => write!(f, "IceFailed"),
            Self::TlsFailed => write!(f, "TlsFailed"),
            Self::SrtpFailed => write!(f, "SrtpFailed"),
            Self::AudioFormatUnsupported => write!(f, "AudioFormatUnsupported"),
            Self::AudioPipelineBroken => write!(f, "AudioPipelineBroken"),
            Self::DtmfFailed => write!(f, "DtmfFailed"),
            Self::Timeout => write!(f, "Timeout"),
            Self::ChannelClosed => write!(f, "ChannelClosed"),
            Self::NativeError => write!(f, "NativeError"),
            Self::ShutdownInProgress => write!(f, "ShutdownInProgress"),
            Self::InternalInvariantBroken => write!(f, "InternalInvariantBroken"),
        }
    }
}

// ---------------------------------------------------------------------------
// SipError — crate 統一エラー型
// ---------------------------------------------------------------------------

/// crate 統一エラー型。
///
/// すべての公開 API は `Result<T, SipError>` を返す。
/// `thiserror::Error` により `Display` および `std::error::Error` が自動導出される。
///
/// # フィールド
///
/// * `kind` — プログラム的に判別可能なエラー種別
/// * `message` — 人間可読なエラー詳細
/// * `native_status` — PJSIP ネイティブエラーコード（該当する場合のみ）
/// * `account_id` — 関連アカウントの識別子（該当する場合のみ）
/// * `call_id` — 関連通話の識別子（該当する場合のみ）
/// * `retryable` — リトライ可能かどうか
#[derive(Debug, Error)]
#[error("{kind}: {message}")]
pub struct SipError {
    /// エラー種別（プログラム的判別用）。
    pub kind: SipErrorKind,

    /// 人間可読なエラー詳細（日本語または英語）。
    pub message: String,

    /// PJSIP ネイティブエラーコード（該当する場合）。
    pub native_status: Option<i32>,

    /// 関連アカウント ID（該当する場合）。
    pub account_id: Option<AccountId>,

    /// 関連通話 ID（該当する場合）。
    pub call_id: Option<CallId>,

    /// リトライ可能フラグ。
    ///
    /// - `true`: 一時的な状態に起因し、リトライで回復する可能性がある
    /// - `false`: 設定や前提条件に起因し、リトライしても回復しない
    pub retryable: bool,
}

// ---------------------------------------------------------------------------
// コンストラクタヘルパー
// ---------------------------------------------------------------------------

impl SipError {
    /// 設定値のバリデーションエラーを生成する。
    ///
    /// 設定値が不正な場合に使用する。このエラーはリトライ不可。
    pub fn invalid_config(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::InvalidConfig,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// 状態遷移違反エラーを生成する。
    ///
    /// 現在の状態では許可されない操作を実行しようとした場合に使用する。
    /// 状態が変化すればリトライ成功しうるためリトライ可能。
    pub fn invalid_state(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::InvalidState,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// タイムアウトエラーを生成する。
    ///
    /// 操作が所定の時間内に完了しなかった場合に使用する。
    /// ネットワーク状況により次回成功しうるためリトライ可能。
    pub fn timeout(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::Timeout,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// ネイティブエラー（PJSIP）をラップする。
    ///
    /// `pj_status_t != PJ_SUCCESS` の場合に使用する。
    /// ネイティブ状態が回復しうるためリトライ可能。
    pub fn native_error(
        msg: impl Into<String>,
        native_status: i32,
        account_id: Option<AccountId>,
        call_id: Option<CallId>,
    ) -> Self {
        Self {
            kind: SipErrorKind::NativeError,
            message: msg.into(),
            native_status: Some(native_status),
            account_id,
            call_id,
            retryable: true,
        }
    }

    /// チャネル閉鎖エラーを生成する。
    ///
    /// `EventBus` の broadcast チャネルが閉鎖された場合に使用する。
    /// チャネルインスタンスは再利用不可のためリトライ不可。
    pub fn channel_closed(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::ChannelClosed,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// シャットダウン中エラーを生成する。
    ///
    /// クライアントがシャットダウン処理中に操作が実行された場合に使用する。
    /// クライアント終了中は操作不能のためリトライ不可。
    pub fn shutdown_in_progress() -> Self {
        Self {
            kind: SipErrorKind::ShutdownInProgress,
            message: "client is shutting down".into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// 内部不変条件違反エラーを生成する。
    ///
    /// プログラム上のバグにより内部状態の不変条件が破綻した場合に使用する。
    /// コード修正が必要なためリトライ不可。
    pub fn invariant_broken(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::InternalInvariantBroken,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // 1. Display 出力形式の検証
    // -----------------------------------------------------------------------

    /// Display 出力が `{kind}: {message}` 形式であることを確認する。
    #[test]
    fn test_sip_error_display_contains_kind_and_message() {
        let err = SipError::invalid_config("port must be > 0");
        let display = format!("{}", err);
        assert!(
            display.contains("InvalidConfig"),
            "Display に kind 名が含まれること: {}",
            display
        );
        assert!(
            display.contains("port must be > 0"),
            "Display に message が含まれること: {}",
            display
        );
    }

    // -----------------------------------------------------------------------
    // 2. retryable フラグの決定論的マッピング
    // -----------------------------------------------------------------------

    /// retryable=false のグループが正しく設定されることを確認する。
    #[test]
    fn test_retryable_false_group() {
        assert!(!SipError::invalid_config("").retryable);
        assert!(!SipError::channel_closed("").retryable);
        assert!(!SipError::shutdown_in_progress().retryable);
        assert!(!SipError::invariant_broken("").retryable);
    }

    /// retryable=true のグループが正しく設定されることを確認する。
    #[test]
    fn test_retryable_true_group() {
        assert!(SipError::invalid_state("").retryable);
        assert!(SipError::timeout("").retryable);
    }

    /// native_error は retryable=true であることを確認する。
    #[test]
    fn test_native_error_is_retryable() {
        let err = SipError::native_error("pjsip error", 70001, None, None);
        assert!(err.retryable);
    }

    // -----------------------------------------------------------------------
    // 3. account_id / call_id のラウンドトリップ
    // -----------------------------------------------------------------------

    /// account_id と call_id が正しく設定・取得できることを確認する。
    #[test]
    fn test_account_call_id_roundtrip() {
        let aid = AccountId::from_test(42);
        let cid = CallId::from_test(99);
        let err = SipError::native_error("invite failed", 500, Some(aid), Some(cid));

        assert_eq!(err.account_id, Some(AccountId::from_test(42)));
        assert_eq!(err.call_id, Some(CallId::from_test(99)));
        assert_eq!(err.native_status, Some(500));
    }

    // -----------------------------------------------------------------------
    // 4. native_status の Option 透過性
    // -----------------------------------------------------------------------

    /// コンストラクタが native_status を設定しない場合、None になることを確認する。
    #[test]
    fn test_native_status_none() {
        let err = SipError::invalid_config("bad config");
        assert!(err.native_status.is_none());
    }

    /// コンストラクタが native_status を設定した場合、値が保持されることを確認する。
    #[test]
    fn test_native_status_some() {
        let err = SipError::native_error("pjsip error", 70001, None, None);
        assert_eq!(err.native_status, Some(70001));
    }

    // -----------------------------------------------------------------------
    // 5. 全23バリアントの網羅性確認（コンパイル時検証）
    // -----------------------------------------------------------------------

    /// 全23バリアントの網羅性を match のコンパイル時チェックで保証する。
    ///
    /// 新しい variant が SipErrorKind に追加された場合、このテストはコンパイルエラーになる。
    /// これにより variant 追加時の retryable マッピング漏れを防止する。
    #[test]
    fn test_all_variants_covered_by_retryable_mapping() {
        /// 各 variant の retryable フラグを返す。
        /// この関数内の match が全 variant を網羅していることで、新しい variant 追加時に
        /// コンパイルエラーが発生し、マッピング漏れを防止する。
        fn is_retryable(kind: SipErrorKind) -> bool {
            match kind {
                SipErrorKind::InvalidConfig => false,
                SipErrorKind::InvalidState => true,
                SipErrorKind::AlreadyInitialized => true,
                SipErrorKind::NotInitialized => true,
                SipErrorKind::AccountNotFound => false,
                SipErrorKind::CallNotFound => false,
                SipErrorKind::TransportInitFailed => true,
                SipErrorKind::RegistrationFailed => true,
                SipErrorKind::AuthenticationFailed => false,
                SipErrorKind::InviteFailed => true,
                SipErrorKind::MediaInitFailed => true,
                SipErrorKind::MediaNegotiationFailed => true,
                SipErrorKind::IceFailed => true,
                SipErrorKind::TlsFailed => false,
                SipErrorKind::SrtpFailed => false,
                SipErrorKind::AudioFormatUnsupported => false,
                SipErrorKind::AudioPipelineBroken => true,
                SipErrorKind::DtmfFailed => true,
                SipErrorKind::Timeout => true,
                SipErrorKind::ChannelClosed => false,
                SipErrorKind::NativeError => true,
                SipErrorKind::ShutdownInProgress => false,
                SipErrorKind::InternalInvariantBroken => false,
            }
        }

        // 代表的なバリアントのマッピングが正しいことを確認する。
        assert!(!is_retryable(SipErrorKind::InvalidConfig));
        assert!(is_retryable(SipErrorKind::Timeout));
        assert!(!is_retryable(SipErrorKind::InternalInvariantBroken));
    }

    // -----------------------------------------------------------------------
    // 6. Send + Sync のコンパイル時確認
    // -----------------------------------------------------------------------

    /// SipError が Send + Sync を満たすことを確認する。
    #[test]
    fn test_error_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}

        assert_send::<SipError>();
        assert_sync::<SipError>();
        assert_send::<SipErrorKind>();
        assert_sync::<SipErrorKind>();
    }

    // -----------------------------------------------------------------------
    // 7. Debug 出力の確認
    // -----------------------------------------------------------------------

    /// Debug 出力に kind 名と message が含まれることを確認する。
    #[test]
    fn test_debug_output_format() {
        let err = SipError::invalid_config("test message");
        let debug = format!("{:?}", err);
        assert!(debug.contains("SipError"));
        assert!(debug.contains("kind"));
        assert!(debug.contains("InvalidConfig"));
        assert!(debug.contains("test message"));
    }
}

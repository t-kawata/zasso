//! # 通話型
//!
//! SIP 通話に関連する型定義。RFC §18 の通話状態モデルと遷移ロジックを提供する。

use crate::error::SipError;
use crate::event::EventDirection;

/// SIP 通話状態。
///
/// RFC §18 の通話状態機械（13バリアント）。
/// `#[non_exhaustive]` により将来のバリアント追加に対する破壊的変更を防止する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum CallState {
    /// 新規通話（未発信）。
    New,
    /// 発信中（INVITE 送出後）。
    Calling,
    /// 100 Trying 受信。
    Trying,
    /// 180 Ringing 受信。
    Ringing,
    /// 183 Session Progress 受信（Early Media）。
    EarlyMedia,
    /// 着信（INVITE 受信）。
    Incoming,
    /// 接続中（200 OK 受信/送信後、ACK 前）。
    Connecting,
    /// 通話確立（メディアアクティブ）。
    Active,
    /// 保留中。
    Held,
    /// 転送処理中。
    Transferring,
    /// 切断処理中。
    Disconnecting,
    /// 切断完了（終端状態）。
    Disconnected,
    /// 失敗（終端状態）。
    Failed,
}

impl CallState {
    /// 終端状態かどうかを返す。
    ///
    /// `Disconnected` または `Failed` の場合に `true` を返す。
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Disconnected | Self::Failed)
    }

    /// メディアセッションが確立済みのアクティブ状態かどうかを返す。
    ///
    /// `Active` または `Held` の場合に `true` を返す。
    pub fn is_active_media(&self) -> bool {
        matches!(self, Self::Active | Self::Held)
    }
}

// ---------------------------------------------------------------------------
// CallEvent — 通話状態遷移イベント
// ---------------------------------------------------------------------------

/// 通話状態遷移イベント。
pub enum CallEvent {
    // ── 発信系 ──
    /// INVITE 送出。
    Dialed,
    /// 100 Trying / 180 Ringing 等の暫定応答受信。
    Provisional(u16),
    /// 183 Session Progress 受信（Early Media）。
    EarlyMedia,
    /// 200 OK（正常接続）。
    Connected(u16),
    // ── 着信系 ──
    /// 着信（INVITE 受信）。
    Incoming,
    /// 応答（200 OK 送信）。
    Answered(u16),
    // ── 制御系 ──
    /// 保留。
    Hold,
    /// 保留解除。
    Unhold,
    /// REFER 送信（転送開始）。
    ReferSent,
    /// 転送成功（NOTIFY success）。
    ReferSuccess,
    /// 転送失敗（NOTIFY fail）。
    ReferFailed,
    // ── 切断系 ──
    /// BYE 受信/送信。
    Bye,
    /// CANCEL 送信/受信。
    Cancel,
    /// エラー終了（4xx-6xx またはタイムアウト）。
    Failure(u16, String),
    /// ローカル切断。
    LocalHangup,
}

// ---------------------------------------------------------------------------
// CallState 遷移ロジック（RFC §18.1）
// ---------------------------------------------------------------------------

impl CallState {
    /// 現在の状態から `next` への遷移が合法かどうかを返す。
    pub fn can_transition_to(&self, next: CallState) -> bool {
        use CallState::*;
        matches!(
            (self, next),
            // 発信パス
            (New, Calling) | (Calling, Trying) | (Trying, Ringing) | (Trying, EarlyMedia)
            | (Ringing, Connecting) | (EarlyMedia, Connecting) | (Connecting, Active)
            // 着信パス
            | (New, Incoming) | (Incoming, Connecting)
            // 制御系
            | (Active, Held) | (Held, Active)
            | (Active, Transferring) | (Transferring, Active)
            // 切断パス
            | (Active, Disconnecting) | (Held, Disconnecting) | (Transferring, Disconnecting)
            | (Calling, Disconnecting) | (Disconnecting, Disconnected)
            // 失敗パス
            | (Ringing, Failed) | (EarlyMedia, Failed) | (Connecting, Failed)
            | (Calling, Failed)
        )
    }

    /// イベントを適用し、状態遷移を実行する。
    ///
    /// 不正な遷移の場合は `SipError::InvalidState` を返す。
    pub fn apply_call_event(&mut self, event: CallEvent) -> Result<(), SipError> {
        use CallState as S;

        match (&self, event) {
            // ── 発信系 ──
            (S::New, CallEvent::Dialed) => {
                *self = S::Calling;
                Ok(())
            }
            (S::Calling, CallEvent::Provisional(100)) => {
                *self = S::Trying;
                Ok(())
            }
            (S::Calling, CallEvent::Provisional(180)) => {
                *self = S::Ringing;
                Ok(())
            }
            (S::Calling, CallEvent::EarlyMedia) => {
                *self = S::EarlyMedia;
                Ok(())
            }
            (S::Trying, CallEvent::Provisional(180)) => {
                *self = S::Ringing;
                Ok(())
            }
            (S::Trying, CallEvent::EarlyMedia) => {
                *self = S::EarlyMedia;
                Ok(())
            }
            (S::Ringing, CallEvent::Connected(_)) => {
                *self = S::Connecting;
                Ok(())
            }
            (S::EarlyMedia, CallEvent::Connected(_)) => {
                *self = S::Connecting;
                Ok(())
            }
            (S::Connecting, CallEvent::Connected(_)) => {
                *self = S::Active;
                Ok(())
            }

            // ── 着信系 ──
            (S::New, CallEvent::Incoming) => {
                *self = S::Incoming;
                Ok(())
            }
            (S::Incoming, CallEvent::Answered(_)) => {
                *self = S::Connecting;
                Ok(())
            }

            // ── 制御系 ──
            (S::Active, CallEvent::Hold) => {
                *self = S::Held;
                Ok(())
            }
            (S::Held, CallEvent::Unhold) => {
                *self = S::Active;
                Ok(())
            }
            (S::Active, CallEvent::ReferSent) => {
                *self = S::Transferring;
                Ok(())
            }
            (S::Transferring, CallEvent::ReferSuccess) => {
                *self = S::Active;
                Ok(())
            }
            (S::Transferring, CallEvent::ReferFailed) => {
                *self = S::Disconnecting;
                Ok(())
            }

            // ── 切断系 ──
            (S::Calling, CallEvent::Cancel) => {
                *self = S::Disconnecting;
                Ok(())
            }
            (S::Active, CallEvent::Bye) | (S::Active, CallEvent::LocalHangup) => {
                *self = S::Disconnecting;
                Ok(())
            }
            (S::Held, CallEvent::Bye) | (S::Held, CallEvent::LocalHangup) => {
                *self = S::Disconnecting;
                Ok(())
            }
            (S::Disconnecting, CallEvent::Bye) | (S::Disconnecting, CallEvent::LocalHangup) => {
                *self = S::Disconnected;
                Ok(())
            }

            // ── 失敗パス ──
            (S::Ringing, CallEvent::Failure(_, _)) => {
                *self = S::Failed;
                Ok(())
            }
            (S::EarlyMedia, CallEvent::Failure(_, _)) => {
                *self = S::Failed;
                Ok(())
            }
            (S::Connecting, CallEvent::Failure(_, _)) => {
                *self = S::Failed;
                Ok(())
            }
            (S::Calling, CallEvent::Failure(_, _)) => {
                *self = S::Failed;
                Ok(())
            }

            // 上記以外は不正遷移。
            (current, _) => Err(SipError::invalid_state(format!(
                "invalid call event for state: {:?}",
                current
            ))),
        }
    }

    /// 通話の方向を返す。
    ///
    /// 発信経路（`Dialed` 適用後）は `Outbound`、
    /// 着信経路（`Incoming` 適用後）は `Inbound`、
    /// 未確定（`New`）は `None`。
    pub fn direction(&self) -> Option<EventDirection> {
        use CallState::*;
        match self {
            New | Disconnected | Failed => None,
            Calling | Trying | Ringing | EarlyMedia | Connecting => Some(EventDirection::Outbound),
            Incoming => Some(EventDirection::Inbound),
            Active | Held | Transferring | Disconnecting => {
                // 発信/着信の区別は CallEntry の追跡が必要。
                // 本メソッドでは簡易的に None を返す（M12 で CallEntry 経由に変更予定）。
                None
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

    /// is_terminal() が Disconnected / Failed のみ true を返すことを確認する。
    #[test]
    fn test_is_terminal() {
        assert!(CallState::Disconnected.is_terminal());
        assert!(CallState::Failed.is_terminal());
    }

    /// その他11バリアントで is_terminal() が false を返すことを確認する。
    #[test]
    fn test_is_not_terminal() {
        assert!(!CallState::New.is_terminal());
        assert!(!CallState::Calling.is_terminal());
        assert!(!CallState::Trying.is_terminal());
        assert!(!CallState::Ringing.is_terminal());
        assert!(!CallState::EarlyMedia.is_terminal());
        assert!(!CallState::Incoming.is_terminal());
        assert!(!CallState::Connecting.is_terminal());
        assert!(!CallState::Active.is_terminal());
        assert!(!CallState::Held.is_terminal());
        assert!(!CallState::Transferring.is_terminal());
        assert!(!CallState::Disconnecting.is_terminal());
    }

    /// is_active_media() が Active / Held で true を返すことを確認する。
    #[test]
    fn test_is_active_media() {
        assert!(CallState::Active.is_active_media());
        assert!(CallState::Held.is_active_media());
    }

    /// その他11バリアントで is_active_media() が false を返すことを確認する。
    #[test]
    fn test_is_not_active_media() {
        assert!(!CallState::New.is_active_media());
        assert!(!CallState::Calling.is_active_media());
        assert!(!CallState::Trying.is_active_media());
        assert!(!CallState::Ringing.is_active_media());
        assert!(!CallState::EarlyMedia.is_active_media());
        assert!(!CallState::Incoming.is_active_media());
        assert!(!CallState::Connecting.is_active_media());
        assert!(!CallState::Transferring.is_active_media());
        assert!(!CallState::Disconnecting.is_active_media());
        assert!(!CallState::Disconnected.is_active_media());
        assert!(!CallState::Failed.is_active_media());
    }

    /// Clone / Copy / PartialEq が正しく機能することを確認する。
    #[test]
    fn test_clone_copy_eq() {
        let state = CallState::Active;
        let cloned = state;
        assert_eq!(state, cloned);
    }

    /// #[non_exhaustive] が付与されていることを確認する。
    #[test]
    fn test_non_exhaustive() {
        // 同一クレート内での非網羅的マッチが許可されること。
        let state = CallState::Active;
        assert!(matches!(state, CallState::Active));
    }

    // -----------------------------------------------------------------------
    // CallState transition tests
    // -----------------------------------------------------------------------

    /// 発信正常系: New → Calling → Trying → Ringing → Connecting → Active → Disconnecting → Disconnected。
    fn run_outgoing_normal(use_failure: bool) {
        let mut state = CallState::New;

        assert!(state.apply_call_event(CallEvent::Dialed).is_ok());
        assert_eq!(state, CallState::Calling);

        assert!(state.apply_call_event(CallEvent::Provisional(100)).is_ok());
        assert_eq!(state, CallState::Trying);

        assert!(state.apply_call_event(CallEvent::Provisional(180)).is_ok());
        assert_eq!(state, CallState::Ringing);

        assert!(state.apply_call_event(CallEvent::Connected(200)).is_ok());
        assert_eq!(state, CallState::Connecting);

        assert!(state.apply_call_event(CallEvent::Connected(200)).is_ok());
        assert_eq!(state, CallState::Active);

        if use_failure {
            assert!(state.apply_call_event(CallEvent::Bye).is_ok());
            assert_eq!(state, CallState::Disconnecting);
            assert!(state.apply_call_event(CallEvent::Bye).is_ok());
            assert_eq!(state, CallState::Disconnected);
        }
    }

    #[test]
    fn test_outgoing_normal() {
        run_outgoing_normal(true);
    }

    /// 発信 EarlyMedia 経由: New → Calling → Trying → EarlyMedia → Connecting → Active。
    #[test]
    fn test_outgoing_early_media() {
        let mut state = CallState::New;
        assert!(state.apply_call_event(CallEvent::Dialed).is_ok());
        assert!(state.apply_call_event(CallEvent::Provisional(100)).is_ok());
        assert!(state.apply_call_event(CallEvent::EarlyMedia).is_ok());
        assert_eq!(state, CallState::EarlyMedia);
        assert!(state.apply_call_event(CallEvent::Connected(200)).is_ok());
        assert_eq!(state, CallState::Connecting);
        assert!(state.apply_call_event(CallEvent::Connected(200)).is_ok());
        assert_eq!(state, CallState::Active);
    }

    /// 着信正常系: New → Incoming → Connecting → Active。
    #[test]
    fn test_incoming_normal() {
        let mut state = CallState::New;
        assert!(state.apply_call_event(CallEvent::Incoming).is_ok());
        assert_eq!(state, CallState::Incoming);
        assert!(state.apply_call_event(CallEvent::Answered(200)).is_ok());
        assert_eq!(state, CallState::Connecting);
        assert!(state.apply_call_event(CallEvent::Connected(200)).is_ok());
        assert_eq!(state, CallState::Active);
    }

    /// Hold/Unhold: Active → Held → Active。
    #[test]
    fn test_hold_unhold() {
        let mut state = CallState::Active;
        assert!(state.apply_call_event(CallEvent::Hold).is_ok());
        assert_eq!(state, CallState::Held);
        assert!(state.apply_call_event(CallEvent::Unhold).is_ok());
        assert_eq!(state, CallState::Active);
    }

    /// Transfer: Active → Transferring → Active（NOTIFY success）。
    #[test]
    fn test_transfer_success() {
        let mut state = CallState::Active;
        assert!(state.apply_call_event(CallEvent::ReferSent).is_ok());
        assert_eq!(state, CallState::Transferring);
        assert!(state.apply_call_event(CallEvent::ReferSuccess).is_ok());
        assert_eq!(state, CallState::Active);
    }

    /// Transfer 失敗: Active → Transferring → Disconnecting。
    #[test]
    fn test_transfer_fail() {
        let mut state = CallState::Active;
        assert!(state.apply_call_event(CallEvent::ReferSent).is_ok());
        assert_eq!(state, CallState::Transferring);
        assert!(state.apply_call_event(CallEvent::ReferFailed).is_ok());
        assert_eq!(state, CallState::Disconnecting);
    }

    /// 発信拒否（486 Busy）。
    #[test]
    fn test_call_rejected() {
        let mut state = CallState::Ringing;
        assert!(state
            .apply_call_event(CallEvent::Failure(486, "Busy".into()))
            .is_ok());
        assert_eq!(state, CallState::Failed);
    }

    /// Cancel: Calling → Disconnecting → Disconnected。
    #[test]
    fn test_cancel() {
        let mut state = CallState::Calling;
        assert!(state.apply_call_event(CallEvent::Cancel).is_ok());
        assert_eq!(state, CallState::Disconnecting);
        assert!(state.apply_call_event(CallEvent::Bye).is_ok());
        assert_eq!(state, CallState::Disconnected);
    }

    /// 切断後の操作が InvalidState を返すことを確認する。
    #[test]
    fn test_post_disconnect_invalid() {
        let mut state = CallState::Disconnected;
        let result = state.apply_call_event(CallEvent::Hold);
        assert!(result.is_err());
    }

    /// direction() の簡易確認。
    #[test]
    fn test_direction() {
        assert_eq!(CallState::New.direction(), None);
        assert_eq!(
            CallState::Calling.direction(),
            Some(EventDirection::Outbound)
        );
        assert_eq!(
            CallState::Incoming.direction(),
            Some(EventDirection::Inbound)
        );
        assert_eq!(CallState::Disconnected.direction(), None);
        assert_eq!(CallState::Failed.direction(), None);
    }

    /// can_transition_to の基本テスト。
    #[test]
    fn test_can_transition_to_basic() {
        assert!(CallState::New.can_transition_to(CallState::Calling));
        assert!(CallState::Calling.can_transition_to(CallState::Trying));
        assert!(CallState::Active.can_transition_to(CallState::Held));
        assert!(CallState::Held.can_transition_to(CallState::Active));
        assert!(CallState::Disconnecting.can_transition_to(CallState::Disconnected));
        // 不正遷移
        assert!(!CallState::New.can_transition_to(CallState::Active));
        assert!(!CallState::Disconnected.can_transition_to(CallState::Active));
        assert!(!CallState::Failed.can_transition_to(CallState::Active));
    }

    /// 全状態×主要イベントの遷移テーブル簡易テスト。
    #[test]
    fn test_transition_table() {
        let mut state = CallState::New;
        // 各主要遷移パスを網羅。
        assert!(state.apply_call_event(CallEvent::Dialed).is_ok());
        assert_eq!(state, CallState::Calling);

        // Calling からの無効イベント.
        assert!(state.apply_call_event(CallEvent::Hold).is_err());

        // 切断.
        let mut s2 = CallState::Calling;
        assert!(s2.apply_call_event(CallEvent::Cancel).is_ok());
        assert_eq!(s2, CallState::Disconnecting);

        // 切断後は何も受け付けない.
        assert!(s2.apply_call_event(CallEvent::LocalHangup).is_ok());
        assert_eq!(s2, CallState::Disconnected);
        assert!(s2.apply_call_event(CallEvent::Dialed).is_err());
    }
}

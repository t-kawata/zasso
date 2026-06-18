//! # アカウント型
//!
//! SIP アカウントに関連する型定義。RFC §17 の登録状態モデルを提供する。

use std::fmt;

use crate::error::SipError;

/// SIP 登録状態。
///
/// RFC §17 の登録状態機械（7状態）。
/// 発信は未登録でも常に可能なため、この状態は発信可否に影響しない。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationState {
    /// 登録機能無効。
    Disabled,
    /// 未登録（初期状態）。
    Idle,
    /// 登録処理中。
    Registering,
    /// 登録完了。
    Registered,
    /// 登録解除処理中。
    Unregistering,
    /// 登録失敗。
    Failed,
    /// 登録期限切れ。
    Expired,
}

impl fmt::Display for RegistrationState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Disabled => write!(f, "disabled"),
            Self::Idle => write!(f, "idle"),
            Self::Registering => write!(f, "registering"),
            Self::Registered => write!(f, "registered"),
            Self::Unregistering => write!(f, "unregistering"),
            Self::Failed => write!(f, "failed"),
            Self::Expired => write!(f, "expired"),
        }
    }
}

// ---------------------------------------------------------------------------
// RegistrationEvent — 登録状態遷移イベント
// ---------------------------------------------------------------------------

/// 登録状態遷移イベント。
///
/// 状態機械を駆動する外部・内部イベント。
pub enum RegistrationEvent {
    /// 明示的な登録要求。
    Register,
    /// 明示的な登録解除要求。
    Unregister,
    /// 登録機能の有効/無効設定。
    SetEnabled(bool),
    /// 登録成功（PJSIP callback）。
    Success,
    /// 登録失敗（PJSIP callback）。
    Failure(SipError),
    /// 登録期限切れ（PJSIP callback）。
    Expired,
}

// ---------------------------------------------------------------------------
// RegistrationState 遷移ロジック（RFC §17.1）
// ---------------------------------------------------------------------------

impl RegistrationState {
    /// 現在の状態から `next` への遷移が合法かどうかを返す。
    pub fn can_transition_to(&self, next: RegistrationState) -> bool {
        use RegistrationState::*;
        matches!(
            (self, next),
            // Register / SetEnabled(true) → Registering
            (Disabled, Registering)
                | (Idle, Registering)
                | (Failed, Registering)
                | (Expired, Registering)
            // SetEnabled(false) → Disabled
            | (Idle, Disabled)
            | (Registering, Disabled)
            | (Registered, Disabled)
            | (Unregistering, Disabled)
            | (Failed, Disabled)
            | (Expired, Disabled)
            // Success → 正常遷移
            | (Registering, Registered)
            | (Unregistering, Idle)
            // Failure → Failed
            | (Registering, Failed)
            | (Unregistering, Failed)
            // Unregister による遷移
            | (Registered, Unregistering)
            // Expired
            | (Registered, Expired)
        )
    }

    /// イベントを適用し、状態遷移を実行する。
    ///
    /// 不正な遷移の場合は `SipError::InvalidState` を返す。
    /// `Registered` 状態での `Register` イベントは no-op（現在状態を維持）として許可する。
    pub fn apply_event(&mut self, event: RegistrationEvent) -> Result<(), SipError> {
        use RegistrationState as S;

        match (&self, event) {
            // Register — 登録要求
            (S::Disabled, RegistrationEvent::Register)
            | (S::Idle, RegistrationEvent::Register)
            | (S::Failed, RegistrationEvent::Register)
            | (S::Expired, RegistrationEvent::Register) => {
                *self = S::Registering;
                Ok(())
            }
            // Registered での Register は no-op。
            (S::Registered, RegistrationEvent::Register) => Ok(()),

            // Unregister — 登録解除要求
            (S::Registered, RegistrationEvent::Unregister) => {
                *self = S::Unregistering;
                Ok(())
            }

            // SetEnabled — 有効/無効設定
            // Registered での SetEnabled(true) は no-op。
            (S::Registered, RegistrationEvent::SetEnabled(true)) => Ok(()),
            (state, RegistrationEvent::SetEnabled(true))
                if !matches!(state, S::Registering | S::Unregistering) =>
            {
                *self = S::Registering;
                Ok(())
            }
            (state, RegistrationEvent::SetEnabled(false)) if !matches!(state, S::Disabled) => {
                *self = S::Disabled;
                Ok(())
            }
            // 既に Disabled → no-op
            (S::Disabled, RegistrationEvent::SetEnabled(false)) => Ok(()),

            // Success — 登録成功
            (S::Registering, RegistrationEvent::Success) => {
                *self = S::Registered;
                Ok(())
            }
            (S::Unregistering, RegistrationEvent::Success) => {
                *self = S::Idle;
                Ok(())
            }

            // Failure — 登録失敗
            (S::Registering, RegistrationEvent::Failure(_)) => {
                *self = S::Failed;
                Ok(())
            }
            (S::Unregistering, RegistrationEvent::Failure(_)) => {
                *self = S::Failed;
                Ok(())
            }

            // Expired — 登録期限切れ
            (S::Registered, RegistrationEvent::Expired) => {
                *self = S::Expired;
                Ok(())
            }

            // 上記以外の組み合わせは不正遷移。
            (current, _) => {
                return Err(SipError::invalid_state(format!(
                    "cannot apply event in current state: {:?}",
                    current
                )));
            }
        }
    }

    /// 登録完了状態（`Registered`）かどうかを返す。
    pub fn is_registered(&self) -> bool {
        matches!(self, Self::Registered)
    }

    /// 登録処理進行中（`Registering | Unregistering`）かどうかを返す。
    pub fn is_in_progress(&self) -> bool {
        matches!(self, Self::Registering | Self::Unregistering)
    }

    /// 回復不能エラー状態（`Failed`）かどうかを返す。
    pub fn is_terminal_error(&self) -> bool {
        matches!(self, Self::Failed)
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 全バリアントの Display が期待通りの文字列を返すことを確認する。
    #[test]
    fn test_registration_state_display() {
        assert_eq!(RegistrationState::Disabled.to_string(), "disabled");
        assert_eq!(RegistrationState::Idle.to_string(), "idle");
        assert_eq!(RegistrationState::Registering.to_string(), "registering");
        assert_eq!(RegistrationState::Registered.to_string(), "registered");
        assert_eq!(
            RegistrationState::Unregistering.to_string(),
            "unregistering"
        );
        assert_eq!(RegistrationState::Failed.to_string(), "failed");
        assert_eq!(RegistrationState::Expired.to_string(), "expired");
    }

    // -----------------------------------------------------------------------
    // RegistrationState transition tests
    // -----------------------------------------------------------------------

    /// Disabled → Registering → Registered → Unregistering → Idle の全遷移。
    #[test]
    fn test_full_lifecycle() {
        let mut state = RegistrationState::Disabled;

        assert!(state.apply_event(RegistrationEvent::Register).is_ok());
        assert_eq!(state, RegistrationState::Registering);

        assert!(state.apply_event(RegistrationEvent::Success).is_ok());
        assert_eq!(state, RegistrationState::Registered);

        assert!(state.apply_event(RegistrationEvent::Unregister).is_ok());
        assert_eq!(state, RegistrationState::Unregistering);

        assert!(state.apply_event(RegistrationEvent::Success).is_ok());
        assert_eq!(state, RegistrationState::Idle);
    }

    /// Idle → Registering → Registered。
    #[test]
    fn test_register_from_idle() {
        let mut state = RegistrationState::Idle;
        assert!(state.apply_event(RegistrationEvent::Register).is_ok());
        assert_eq!(state, RegistrationState::Registering);
        assert!(state.apply_event(RegistrationEvent::Success).is_ok());
        assert_eq!(state, RegistrationState::Registered);
    }

    /// Failed → Registering → Registered。
    #[test]
    fn test_retry_after_failure() {
        let mut state = RegistrationState::Failed;
        assert!(state.apply_event(RegistrationEvent::Register).is_ok());
        assert_eq!(state, RegistrationState::Registering);
        assert!(state.apply_event(RegistrationEvent::Success).is_ok());
        assert_eq!(state, RegistrationState::Registered);
    }

    /// Registered → Expired → Registering → Registered。
    #[test]
    fn test_expiry_renewal() {
        let mut state = RegistrationState::Registered;
        assert!(state.apply_event(RegistrationEvent::Expired).is_ok());
        assert_eq!(state, RegistrationState::Expired);
        assert!(state.apply_event(RegistrationEvent::Register).is_ok());
        assert_eq!(state, RegistrationState::Registering);
        assert!(state.apply_event(RegistrationEvent::Success).is_ok());
        assert_eq!(state, RegistrationState::Registered);
    }

    /// Registered 状態での Register が no-op として許可されることを確認する。
    #[test]
    fn test_reregister_is_noop() {
        let mut state = RegistrationState::Registered;
        let result = state.apply_event(RegistrationEvent::Register);
        assert!(result.is_ok());
        assert_eq!(state, RegistrationState::Registered);
    }

    /// Disabled 状態での Unregister が InvalidState を返すことを確認する。
    #[test]
    fn test_unregister_from_disabled() {
        let mut state = RegistrationState::Disabled;
        let result = state.apply_event(RegistrationEvent::Unregister);
        assert!(result.is_err());
    }

    /// Failed 状態での Unregister が InvalidState を返すことを確認する。
    #[test]
    fn test_unregister_from_failed() {
        let mut state = RegistrationState::Failed;
        let result = state.apply_event(RegistrationEvent::Unregister);
        assert!(result.is_err());
    }

    /// SetEnabled(false) が Registering からのキャンセル、Registered からの即時無効化を確認する。
    #[test]
    fn test_set_enabled_false() {
        // Registering → Disabled
        let mut state = RegistrationState::Registering;
        assert!(state
            .apply_event(RegistrationEvent::SetEnabled(false))
            .is_ok());
        assert_eq!(state, RegistrationState::Disabled);

        // Registered → Disabled
        let mut state = RegistrationState::Registered;
        assert!(state
            .apply_event(RegistrationEvent::SetEnabled(false))
            .is_ok());
        assert_eq!(state, RegistrationState::Disabled);

        // Disabled → no-op
        let mut state = RegistrationState::Disabled;
        assert!(state
            .apply_event(RegistrationEvent::SetEnabled(false))
            .is_ok());
        assert_eq!(state, RegistrationState::Disabled);
    }

    /// is_registered() が Registered のみ true を返すことを確認する。
    #[test]
    fn test_is_registered() {
        assert!(RegistrationState::Registered.is_registered());
        assert!(!RegistrationState::Disabled.is_registered());
        assert!(!RegistrationState::Idle.is_registered());
        assert!(!RegistrationState::Registering.is_registered());
        assert!(!RegistrationState::Unregistering.is_registered());
        assert!(!RegistrationState::Failed.is_registered());
        assert!(!RegistrationState::Expired.is_registered());
    }

    /// is_in_progress() が Registering / Unregistering で true を返すことを確認する。
    #[test]
    fn test_is_in_progress() {
        assert!(RegistrationState::Registering.is_in_progress());
        assert!(RegistrationState::Unregistering.is_in_progress());
        assert!(!RegistrationState::Disabled.is_in_progress());
        assert!(!RegistrationState::Idle.is_in_progress());
        assert!(!RegistrationState::Registered.is_in_progress());
        assert!(!RegistrationState::Failed.is_in_progress());
        assert!(!RegistrationState::Expired.is_in_progress());
    }

    /// is_terminal_error() が Failed のみ true を返すことを確認する。
    #[test]
    fn test_is_terminal_error() {
        assert!(RegistrationState::Failed.is_terminal_error());
        assert!(!RegistrationState::Disabled.is_terminal_error());
        assert!(!RegistrationState::Idle.is_terminal_error());
        assert!(!RegistrationState::Registering.is_terminal_error());
        assert!(!RegistrationState::Registered.is_terminal_error());
        assert!(!RegistrationState::Unregistering.is_terminal_error());
        assert!(!RegistrationState::Expired.is_terminal_error());
    }

    /// 48 通りの遷移表をテーブルテストで検証する。
    #[test]
    fn test_all_transitions_table() {
        let states = [
            RegistrationState::Disabled,
            RegistrationState::Idle,
            RegistrationState::Registering,
            RegistrationState::Registered,
            RegistrationState::Unregistering,
            RegistrationState::Failed,
            RegistrationState::Expired,
        ];

        // 各状態から各イベントを試行し、期待される結果を検証。
        for &start in &states {
            for event in generate_events() {
                let mut state = start;
                let result = state.apply_event(event);
                validate_result(&start, &state, &result);
            }
        }
    }

    /// テスト用の全 RegistrationEvent を生成する。
    fn generate_events() -> Vec<RegistrationEvent> {
        vec![
            RegistrationEvent::Register,
            RegistrationEvent::Unregister,
            RegistrationEvent::SetEnabled(true),
            RegistrationEvent::SetEnabled(false),
            RegistrationEvent::Success,
            RegistrationEvent::Failure(SipError::invalid_config("test")),
            RegistrationEvent::Expired,
        ]
    }

    /// 遷移結果を期待値と検証する。
    fn validate_result(
        before: &RegistrationState,
        after: &RegistrationState,
        result: &Result<(), SipError>,
    ) {
        match (before, after) {
            // 正常遷移: イベント適用前後で状態が変化した場合。
            _ if before != after => {
                assert!(
                    result.is_ok(),
                    "正常遷移が Err を返しました: {:?} → {:?}",
                    before,
                    after
                );
                assert!(
                    before.can_transition_to(*after),
                    "can_transition_to が false を返しました: {:?} → {:?}",
                    before,
                    after
                );
            }
            // no-op: 状態が変化しなかった場合（Registered→Register 等）。
            _ if result.is_ok() => {
                assert_eq!(
                    before, after,
                    "no-op で状態が変化しました: {:?} → {:?}",
                    before, after
                );
            }
            // 不正遷移: Err が返った場合。
            _ => {
                assert_eq!(
                    before, after,
                    "Err でも状態が変化しました: {:?} → {:?}",
                    before, after
                );
                if let Err(ref err) = result {
                    use crate::error::SipErrorKind;
                    assert_eq!(
                        err.kind,
                        SipErrorKind::InvalidState,
                        "不正遷移のエラー種別が InvalidState ではありません: {:?}",
                        err
                    );
                }
            }
        }
    }
}

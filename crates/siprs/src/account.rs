//! # アカウント型
//!
//! SIP アカウントに関連する型定義。RFC §17 の登録状態モデルを提供する。

use std::fmt;

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
        assert_eq!(RegistrationState::Unregistering.to_string(), "unregistering");
        assert_eq!(RegistrationState::Failed.to_string(), "failed");
        assert_eq!(RegistrationState::Expired.to_string(), "expired");
    }
}

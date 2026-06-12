//! voiput crate のエラー型
//!
//! 移植元: docs/rfc-stt-portable-crate.md §4.5
//!
//! M0-1 時点では SttEngine をインライン定義している。
//! M0-2 で types.rs が作成されたら、crate::types::SttEngine に差し替える（TODO）。

use crate::types::SttEngine;
use thiserror::Error;

/// voiput crate のエラー型
///
/// 全6 variant で構成される。アプリケーション層でのエラーハンドリングに使用する。
#[derive(Debug, Error)]
pub enum VoiputError {
    /// 設定が不正
    #[error("設定が不正です: {0}")]
    InvalidConfig(String),

    /// 選択されたエンジンが現在のプラットフォームで利用不可
    #[error("エンジン {engine:?} は現在のプラットフォームで利用できません: {reason}")]
    UnsupportedEngine { engine: SttEngine, reason: String },

    /// 権限不足
    #[error("権限がありません: {0}")]
    PermissionDenied(String),

    /// 初期化エラー
    #[error("初期化エラー: {0}")]
    InitError(String),

    /// 実行時エラー
    #[error("実行時エラー: {0}")]
    RuntimeError(String),

    /// I/O エラー（透過）
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn test_invalid_config_display() {
        let err = VoiputError::InvalidConfig("locale is required".into());
        assert_eq!(err.to_string(), "設定が不正です: locale is required");
    }

    #[test]
    fn test_unsupported_engine_display() {
        let err = VoiputError::UnsupportedEngine {
            engine: SttEngine::Os,
            reason: "Linux では OS ネイティブ認識は利用できません".into(),
        };
        let msg = err.to_string();
        assert!(msg.contains("Os"));
        assert!(msg.contains("Linux"));
    }

    #[test]
    fn test_permission_denied_display() {
        let err = VoiputError::PermissionDenied("マイクへのアクセスが拒否されました".into());
        assert_eq!(
            err.to_string(),
            "権限がありません: マイクへのアクセスが拒否されました"
        );
    }

    #[test]
    fn test_init_error_display() {
        let err = VoiputError::InitError("VAD モデルの初期化に失敗しました".into());
        assert_eq!(
            err.to_string(),
            "初期化エラー: VAD モデルの初期化に失敗しました"
        );
    }

    #[test]
    fn test_runtime_error_display() {
        let err = VoiputError::RuntimeError("認識エンジンが応答しません".into());
        assert_eq!(err.to_string(), "実行時エラー: 認識エンジンが応答しません");
    }

    #[test]
    fn test_io_error_transparent() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "ファイルが見つかりません");
        let err = VoiputError::Io(io_err);
        assert!(err.to_string().contains("ファイルが見つかりません"));
    }
}

//! ホットキー監視モジュール
//!
//! macOS では CGEventTap、Windows では rdev + GetAsyncKeyState ポーリング +
//! WH_KEYBOARD_LL フックを介して Option/Alt キーのダブルタップを検出し、
//! 録音開始・BufferFlush・OrchestratorInput 等のアクションを送出する。
//!
//! # 移植元
//!
//! - macOS: `mycute/src/hotkey_mac.rs`
//! - Windows: `mycute/src/hotkey_win.rs`
//! - Windows: `mycute/src/hotkey_win_hook.rs`

#[cfg(target_os = "macos")]
pub mod mac;
#[cfg(target_os = "windows")]
pub mod win;
#[cfg(target_os = "windows")]
pub mod win_hook;

/// ホットキーアクション — ダブルタップやキーコンボによって送出されるイベント種別
///
/// `HotkeyMonitor::start()` から返される mpsc チャネル経由でアプリケーション層に通知される。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyAction {
    /// 録音開始（非録音状態での Option/Alt ダブルタップ）
    Start,
    /// 選択テキスト補正（ホットキーコンボ Option+H）
    Correct,
    /// 要約（ホットキーコンボ Option+M）
    Summarize,
    /// バッファフラッシュ（録音中の Option/Alt ダブルタップ）
    BufferFlush,
    /// オーケストレーター入力の開始（Ctrl+Option / Ctrl+Alt 同時押し）
    OrchestratorInput,
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hotkey_action_debug_clone_send() {
        // HotkeyAction が Debug + Clone + Send を満たすことを確認する
        let actions = [
            HotkeyAction::Start,
            HotkeyAction::Correct,
            HotkeyAction::Summarize,
            HotkeyAction::BufferFlush,
            HotkeyAction::OrchestratorInput,
        ];

        for action in &actions {
            let _debug = format!("{:?}", action);
            let _cloned = *action;
        }

        // Send 境界の検証（コンパイル時）
        fn assert_send<T: Send>(_val: &T) {}
        for action in &actions {
            assert_send(action);
        }
    }

    #[test]
    fn test_hotkey_action_variants_distinct() {
        // 全 variant が互いに異なる値であることを確認する
        let start = HotkeyAction::Start;
        let correct = HotkeyAction::Correct;
        let summarize = HotkeyAction::Summarize;
        let flush = HotkeyAction::BufferFlush;
        let orch = HotkeyAction::OrchestratorInput;

        assert_ne!(start, correct);
        assert_ne!(start, summarize);
        assert_ne!(start, flush);
        assert_ne!(start, orch);
        assert_ne!(correct, summarize);
        assert_ne!(correct, flush);
        assert_ne!(correct, orch);
        assert_ne!(summarize, flush);
        assert_ne!(summarize, orch);
        assert_ne!(flush, orch);
    }
}

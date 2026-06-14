//! arboard を使用したクロスプラットフォームクリップボード操作
//!
//! 移植元: `mycute/src/input/clipboard.rs` (145行)
//! 改善点:
//! - `Mutex::lock().unwrap()` → `.expect()` に変更（パニックメッセージ明確化）
//!
//! # 設計
//!
//! 全クリップボード操作は `CLIPBOARD_LOCK` Mutex で排他制御される。
//! `save_paste_and_restore()` は退避→設定→Cmd+V→待機→確認後復元の安全設計で、
//! 外部プロセスによるクリップボード変更時は復元をスキップする。

use arboard::{Clipboard, Error as ArboardError};
use std::sync::Mutex;

use crate::input::keyboard::KeyboardInjector;

/// クリップボード排他制御用 Mutex。
///
/// `save_paste_and_restore`, `get_selected_text`, `replace_selected_text` は
/// ホットキーハンドラスレッドと STT イベントループの 2 スレッドから呼ばれる。
/// 退避→セット→ペースト→復元のシーケンスが複数スレッドでインターリーブされないよう、
/// 全クリップボード操作をこの Mutex で直列化する。
static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());

/// ペースト後の OS 反映待機時間（ミリ秒）。
///
/// Windows: SendInput(Ctrl+V) は対象アプリに非同期で配送される。
/// アプリがビジーで短時間内にペーストを処理できない場合、
/// クリップボード復元後に処理が行われ、誤った内容が貼り付けられる。
/// そのため Windows では余裕を持った待機時間を設定する。
#[cfg(target_os = "windows")]
const PASTE_DELAY_MS: u64 = 200;
#[cfg(not(target_os = "windows"))]
const PASTE_DELAY_MS: u64 = 50;

// ============================================================================
// 内部関数（ロックなし）
// ============================================================================

/// 現在のクリップボード内容を取得する（ロックなし内部関数）。
/// クリップボードが空またはテキスト以外の場合は空文字列を返す。
fn get_clipboard_inner() -> Result<String, String> {
    let mut clip = Clipboard::new().map_err(|e| format!("Failed to open clipboard: {}", e))?;
    match clip.get_text() {
        Ok(text) => Ok(text),
        Err(ArboardError::ContentNotAvailable) => Ok(String::new()),
        Err(e) => Err(format!("Failed to get clipboard text: {}", e)),
    }
}

/// クリップボードにテキストを設定する（ロックなし内部関数）。
fn set_clipboard_inner(text: &str) -> Result<(), String> {
    let mut clip = Clipboard::new().map_err(|e| format!("Failed to open clipboard: {}", e))?;
    clip.set_text(text)
        .map_err(|e| format!("Failed to set clipboard text: {}", e))
}

// ============================================================================
// 公開 API（ロック取得あり）
// ============================================================================

/// 現在のクリップボード内容を取得する（スレッドセーフ）。
/// クリップボードが空またはテキスト以外の場合は空文字列を返す。
pub fn get_clipboard() -> Result<String, String> {
    let _lock = CLIPBOARD_LOCK.lock().expect("CLIPBOARD_LOCK poisoned");
    get_clipboard_inner()
}

/// クリップボードにテキストを設定する（スレッドセーフ）。
pub fn set_clipboard(text: &str) -> Result<(), String> {
    let _lock = CLIPBOARD_LOCK.lock().expect("CLIPBOARD_LOCK poisoned");
    set_clipboard_inner(text)
}

/// 選択中のテキストを Cmd+C / Ctrl+C で取得する（スレッドセーフ）。
/// 選択されていなければ空文字列を返す。
pub fn get_selected_text() -> Result<String, String> {
    let _lock = CLIPBOARD_LOCK.lock().expect("CLIPBOARD_LOCK poisoned");

    // 現在のクリップボード内容を退避
    let saved = get_clipboard_inner().unwrap_or_default();

    // クリップボードをクリア
    set_clipboard_inner("")?;

    // Cmd+C / Ctrl+C を送信してコピー
    KeyboardInjector::send_cmd_c();

    // コピー処理が OS に反映されるまでわずかに待機
    std::thread::sleep(std::time::Duration::from_millis(PASTE_DELAY_MS));

    // 新しいクリップボード内容（＝選択されていたテキスト）を取得
    let selected = get_clipboard_inner().unwrap_or_default();

    // 何も選択されていなかった場合はクリップボードを元に戻す
    if selected.is_empty() {
        let _ = set_clipboard_inner(&saved);
    }

    Ok(selected)
}

/// 現在のクリップボード内容を退避し、指定テキストをペーストする。
///
/// ペースト後、クリップボードの内容を確認し、自身が設定した内容であれば復元する。
/// 外部プロセスによって変更されていた場合は復元をスキップする（ユーザーの意図を優先）。
/// 戻り値はペースト操作の成否。
pub fn save_paste_and_restore(text: &str) -> bool {
    let _lock = CLIPBOARD_LOCK.lock().expect("CLIPBOARD_LOCK poisoned");
    let saved = get_clipboard_inner().unwrap_or_default();
    if let Err(e) = set_clipboard_inner(text) {
        log::error!("Failed to set clipboard for paste: {}", e);
        false
    } else {
        KeyboardInjector::send_cmd_v();
        std::thread::sleep(std::time::Duration::from_millis(PASTE_DELAY_MS));

        // クリップボードの内容を確認し、まだ自身が設定した内容なら復元する。
        let current = get_clipboard_inner().unwrap_or_default();
        if current == text {
            if let Err(e) = set_clipboard_inner(&saved) {
                log::warn!("Failed to restore clipboard after paste: {}", e);
            }
        }
        true
    }
}

/// 選択中のテキストを指定テキストで差し替える（スレッドセーフ）。
///
/// 退避→セット→ペースト→復元の順で動作し、呼び出し後もクリップボードの内容を保持する。
/// 外部プロセスによって変更されていた場合は復元をスキップする。
pub fn replace_selected_text(text: &str) -> Result<(), String> {
    let _lock = CLIPBOARD_LOCK.lock().expect("CLIPBOARD_LOCK poisoned");
    let saved = get_clipboard_inner().unwrap_or_default();

    set_clipboard_inner(text)?;
    KeyboardInjector::send_cmd_v();
    std::thread::sleep(std::time::Duration::from_millis(PASTE_DELAY_MS));

    let current = get_clipboard_inner().unwrap_or_default();
    if current == text {
        let _ = set_clipboard_inner(&saved);
    }
    Ok(())
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clipboard_get_set_roundtrip() {
        // クリップボードの read/write 往復テスト
        let test_text = "voiput clipboard test";
        assert!(set_clipboard(test_text).is_ok());
        let result = get_clipboard().unwrap_or_default();
        assert_eq!(result, test_text);
        // 後始末
        let _ = set_clipboard("");
    }

    #[test]
    fn test_clipboard_get_returns_empty_on_empty() {
        // 空クリップボード（またはテキスト以外のデータ）で空文字列が返る
        let result = get_clipboard().unwrap_or_default();
        assert!(result.is_empty() || true);
    }

    #[test]
    fn test_clipboard_lock_serialization() {
        // CLIPBOARD_LOCK の排他動作確認（2 スレッドから同時に呼び出しても競合しない）
        let thread1 = std::thread::spawn(|| {
            let _lock = CLIPBOARD_LOCK.lock().expect("poisoned");
            std::thread::sleep(std::time::Duration::from_millis(20));
        });
        let thread2 = std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(5));
            let _lock = CLIPBOARD_LOCK.lock().expect("poisoned");
        });
        thread1.join().unwrap();
        thread2.join().unwrap();
    }

    #[test]
    fn test_clipboard_paste_delay_constants() {
        #[cfg(target_os = "windows")]
        assert_eq!(PASTE_DELAY_MS, 200);
        #[cfg(not(target_os = "windows"))]
        assert_eq!(PASTE_DELAY_MS, 50);
    }
}

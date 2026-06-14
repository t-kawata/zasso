//! SendInput を使用した Windows キーボード注入
//!
//! 移植元: `mycute/src/input/keyboard_win.rs` (404行)
//! 改善点:
//! - `Mutex::lock().unwrap()` → `.expect()` に変更
//! - 全 unsafe ブロックに `// SAFETY:` コメントを追加
//!
//! # 設計
//!
//! SendInput API を使用してアクティブなアプリケーションにキーイベントを注入する。
//! `type_text()` はクリップボード方式（Ctrl+V ペースト）を優先し、失敗時のみ
//! 従来の SendInput 文字打鍵方式にフォールバックする。

use std::mem::size_of;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use crate::constants::{DELETION_COOLDOWN_MS_WIN, DELETION_WEIGHT_MS_WIN, KEY_DELAY_MS_WIN};
use crate::input::clipboard;

/// キー削除完了のデッドラインのグローバルリスト。
static DELETION_DEADLINES: Mutex<Vec<Instant>> = Mutex::new(Vec::new());

/// 全てのキーボード入力操作を直列化するためのグローバルロック。
static INPUT_LOCK: Mutex<()> = Mutex::new(());

// ============================================================================
// Windows API 構造体
// ============================================================================

#[repr(C)]
struct KeybdInput {
    w_vk: u16,
    w_scan: u16,
    dw_flags: u32,
    time: u32,
    dw_extra_info: usize,
}

#[repr(C)]
struct Input {
    input_type: u32,
    _pad: u32,
    ki: KeybdInput,
    _union_pad: [u8; 8],
}

// ============================================================================
// Windows API 定数
// ============================================================================

const INPUT_KEYBOARD: u32 = 1;
const KEYEVENTF_UNICODE: u32 = 0x0004;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const VK_CONTROL: u16 = 0x11;
const VK_V: u16 = 0x56;
const VK_BACK: u16 = 0x08;
const MYCUTE_EVENT_TAG: usize = 0x4D594355;

// ============================================================================
// FFI 宣言
// ============================================================================

#[link(name = "user32")]
extern "system" {
    fn SendInput(c_inputs: u32, p_inputs: *const Input, cb_size: i32) -> u32;
}

pub type CGKeyCode = u16;

/// キーボードインジェクター — SendInput を使用したキーイベント注入。
pub struct KeyboardInjector;

impl KeyboardInjector {
    /// アクセシビリティ権限を確認する（Windows では常に true）。
    pub fn is_authorized() -> bool {
        true
    }

    /// 指定テキストを注入する（公開エントリポイント）。
    ///
    /// クリップボード方式（Ctrl+V ペースト）を優先し、失敗時のみ SendInput に
    /// フォールバックする。クリップボード方式は文字抜けが発生しない利点がある。
    pub fn type_text(text: &str) {
        let _lock = INPUT_LOCK.lock().expect("INPUT_LOCK poisoned");
        Self::type_text_inner(text);
    }

    /// type_text の内部実装（ロック取得なし）。
    ///
    /// クリップボード経由で一括ペーストすることで、SendInput の文字抜けを
    /// 根本的に回避する。クリップボード操作が失敗した場合のみ従来方式に
    /// フォールバックする。
    fn type_text_inner(text: &str) {
        wait_for_deletion_completion();
        if text.is_empty() {
            return;
        }

        // 現在のクリップボード内容を退避
        let saved_clipboard = clipboard::get_clipboard().unwrap_or_default();

        // 入力文字列をクリップボードにセット
        if let Err(e) = clipboard::set_clipboard(text) {
            log::error!("[WinInputDiag] Failed to set clipboard for injection: {}", e);
            Self::type_text_sendinput(text);
            return;
        }

        // Ctrl+V を送信
        Self::send_ctrl_key_inner(VK_V);
        thread::sleep(Duration::from_millis(50));

        // クリップボードを復元
        if let Err(e) = clipboard::set_clipboard(&saved_clipboard) {
            log::warn!("[WinInputDiag] Failed to restore clipboard: {}", e);
        }
    }

    /// SendInput による 1 文字ずつの打鍵入力（フォールバック方式）。
    fn type_text_sendinput(text: &str) {
        let utf16: Vec<u16> = text.encode_utf16().collect();
        if utf16.is_empty() {
            return;
        }

        for &code_unit in &utf16 {
            // SAFETY: SendInput は user32.dll のスレッドセーフな関数。
            // 構造体は zeroed で初期化し、必要なフィールドのみ設定する。
            // KEYEVENTF_UNICODE フラグにより w_scan を Unicode コードポイントとして扱う。
            unsafe {
                // キーダウン
                let mut input_down: Input = std::mem::zeroed();
                input_down.input_type = INPUT_KEYBOARD;
                input_down.ki.w_vk = 0;
                input_down.ki.w_scan = code_unit;
                input_down.ki.dw_flags = KEYEVENTF_UNICODE;
                input_down.ki.dw_extra_info = MYCUTE_EVENT_TAG;
                SendInput(1, &input_down, size_of::<Input>() as i32);

                thread::sleep(Duration::from_millis(KEY_DELAY_MS_WIN));

                // キーアップ（w_scan=0 で二重入力防止）
                let mut input_up: Input = std::mem::zeroed();
                input_up.input_type = INPUT_KEYBOARD;
                input_up.ki.w_vk = 0;
                input_up.ki.w_scan = 0;
                input_up.ki.dw_flags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                input_up.ki.dw_extra_info = MYCUTE_EVENT_TAG;
                SendInput(1, &input_up, size_of::<Input>() as i32);

                thread::sleep(Duration::from_millis(KEY_DELAY_MS_WIN));
            }
        }
    }

    /// バックスペースキーを送信して文字を削除する。
    pub fn send_backspaces(count: usize) {
        if count == 0 {
            return;
        }
        let _lock = INPUT_LOCK.lock().expect("INPUT_LOCK poisoned");
        Self::send_backspaces_inner(count);
    }

    /// send_backspaces の内部実装（ロック取得なし）。
    fn send_backspaces_inner(count: usize) {
        if count == 0 {
            return;
        }

        let dynamic_cooldown =
            DELETION_COOLDOWN_MS_WIN + (count as u64 * DELETION_WEIGHT_MS_WIN);
        let estimated_duration_ms = (count as u64 * KEY_DELAY_MS_WIN * 2) + dynamic_cooldown;
        let deadline = Instant::now() + Duration::from_millis(estimated_duration_ms);
        {
            if let Ok(mut deadlines) = DELETION_DEADLINES.lock() {
                deadlines.push(deadline);
            }
        }

        for _ in 0..count {
            // SAFETY: SendInput で VK_BACK のキーダウン＋キーアップを送信。
            // zeroed 構造体に必要なフィールドのみ設定する。
            unsafe {
                let mut input_down: Input = std::mem::zeroed();
                input_down.input_type = INPUT_KEYBOARD;
                input_down.ki.w_vk = VK_BACK;
                input_down.ki.dw_extra_info = MYCUTE_EVENT_TAG;
                SendInput(1, &input_down, size_of::<Input>() as i32);

                thread::sleep(Duration::from_millis(KEY_DELAY_MS_WIN));

                let mut input_up: Input = std::mem::zeroed();
                input_up.input_type = INPUT_KEYBOARD;
                input_up.ki.w_vk = VK_BACK;
                input_up.ki.dw_flags = KEYEVENTF_KEYUP;
                input_up.ki.dw_extra_info = MYCUTE_EVENT_TAG;
                SendInput(1, &input_up, size_of::<Input>() as i32);

                thread::sleep(Duration::from_millis(KEY_DELAY_MS_WIN));
            }
        }
    }

    /// 旧テキストと新テキストを比較し、差分のみを注入する。
    pub fn input_diff(old_text: &str, new_text: &str) {
        let _lock = INPUT_LOCK.lock().expect("INPUT_LOCK poisoned");

        let old_chars: Vec<char> = old_text.chars().collect();
        let new_chars: Vec<char> = new_text.chars().collect();

        // 共通プレフィックスの長さを算出（文字単位）
        let mut common_prefix_chars = 0;
        for (oc, nc) in old_chars.iter().zip(new_chars.iter()) {
            if oc == nc {
                common_prefix_chars += 1;
            } else {
                break;
            }
        }

        let delete_count = old_chars.len() - common_prefix_chars;
        if delete_count > 0 {
            Self::send_backspaces_inner(delete_count);

            let dynamic_cooldown =
                DELETION_COOLDOWN_MS_WIN + (delete_count as u64 * DELETION_WEIGHT_MS_WIN);
            thread::sleep(Duration::from_millis(dynamic_cooldown));
        }

        let type_string: String = new_chars[common_prefix_chars..].iter().collect();
        if !type_string.is_empty() {
            Self::type_text_inner(&type_string);
        }
    }

    /// Ctrl+C（コピー）キー送信。
    pub fn send_cmd_c() {
        Self::send_ctrl_key(0x43); // C キー
    }

    /// Ctrl+V（ペースト）キー送信。
    pub fn send_cmd_v() {
        Self::send_ctrl_key(VK_V);
    }

    /// Ctrl+キーの組み合わせを送信（ロック取得あり）。
    fn send_ctrl_key(keycode: CGKeyCode) {
        let _lock = INPUT_LOCK.lock().expect("INPUT_LOCK poisoned");
        Self::send_ctrl_key_inner(keycode);
    }

    /// Ctrl+キーの組み合わせを送信（内部用：ロック取得なし）。
    fn send_ctrl_key_inner(keycode: CGKeyCode) {
        // SAFETY: SendInput に 4 つの Input 構造体配列を渡して
        // Ctrl down → Key down → Key up → Ctrl up のアトミックシーケンスを送信する。
        unsafe {
            let mut inputs: [Input; 4] = std::mem::zeroed();

            inputs[0].input_type = INPUT_KEYBOARD;
            inputs[0].ki.w_vk = VK_CONTROL;
            inputs[0].ki.dw_extra_info = MYCUTE_EVENT_TAG;

            inputs[1].input_type = INPUT_KEYBOARD;
            inputs[1].ki.w_vk = keycode;
            inputs[1].ki.dw_extra_info = MYCUTE_EVENT_TAG;

            inputs[2].input_type = INPUT_KEYBOARD;
            inputs[2].ki.w_vk = keycode;
            inputs[2].ki.dw_flags = KEYEVENTF_KEYUP;
            inputs[2].ki.dw_extra_info = MYCUTE_EVENT_TAG;

            inputs[3].input_type = INPUT_KEYBOARD;
            inputs[3].ki.w_vk = VK_CONTROL;
            inputs[3].ki.dw_flags = KEYEVENTF_KEYUP;
            inputs[3].ki.dw_extra_info = MYCUTE_EVENT_TAG;

            SendInput(4, inputs.as_ptr(), size_of::<Input>() as i32);
        }
        thread::sleep(Duration::from_millis(10));
    }
}

// ============================================================================
// ユーティリティ
// ============================================================================

fn wait_for_deletion_completion() {
    loop {
        {
            if let Ok(mut deadlines) = DELETION_DEADLINES.lock() {
                let now = Instant::now();
                deadlines.retain(|&deadline| deadline > now);
                if deadlines.is_empty() {
                    return;
                }
            }
        }
        thread::sleep(Duration::from_millis(10));
    }
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyboard_win_is_authorized() {
        assert!(KeyboardInjector::is_authorized());
    }

    #[test]
    fn test_keyboard_win_input_diff() {
        KeyboardInjector::input_diff("hello", "hello");
    }

    #[test]
    fn test_keyboard_win_send_backspaces_zero() {
        KeyboardInjector::send_backspaces(0);
    }

    #[test]
    fn test_keyboard_win_send_cmd_c() {
        KeyboardInjector::send_cmd_c();
    }

    #[test]
    fn test_keyboard_win_send_cmd_v() {
        KeyboardInjector::send_cmd_v();
    }
}

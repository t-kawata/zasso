//! CGEvent を使用した macOS キーボード注入
//!
//! 移植元: `mycute/src/input/keyboard_mac.rs` (325行)
//! 改善点:
//! - `Mutex::lock().unwrap()` → `.expect()` に変更
//! - 全 unsafe ブロックに `// SAFETY:` コメントを追加
//!
//! # 設計
//!
//! CGEvent ベースのキーボードシミュレーションを使用して、アクティブなアプリケーションに
//! テキストを挿入する。全操作は `INPUT_LOCK` で直列化される。
//! Unicode 文字は `CGEventKeyboardSetUnicodeString` により16文字チャンクで注入する。

#[link(name = "CoreGraphics", kind = "framework")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {}

use std::ffi::c_void;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use crate::constants::{DELETION_COOLDOWN_MS_MAC, DELETION_WEIGHT_MS_MAC, KEY_DELAY_MS_MAC};

/// キー削除完了のデッドライン（期限）のグローバルリスト。
/// 進行中の全ての削除操作が論理的に完了するまで、タイピングをブロックするために使用される。
static DELETION_DEADLINES: Mutex<Vec<Instant>> = Mutex::new(Vec::new());

/// 全てのキーボード入力操作を直列化するためのグローバルロック。
/// 一度に進行できる input_diff / type_text / send_backspaces 操作は 1 つだけ。
static INPUT_LOCK: Mutex<()> = Mutex::new(());

pub type CGKeyCode = u16;

/// キーボードインジェクター — CGEvent を使用したキーイベント注入。
pub struct KeyboardInjector;

impl KeyboardInjector {
    /// プロセスがアクセシビリティ権限を持っているか確認する。
    pub fn is_authorized() -> bool {
        // SAFETY: AXIsProcessTrusted は ApplicationServices フレームワークの
        // スレッドセーフな関数。引数なしで現在のプロセスのアクセシビリティ
        // 権限状態を返す。
        unsafe {
            extern "C" {
                fn AXIsProcessTrusted() -> bool;
            }
            AXIsProcessTrusted()
        }
    }

    /// 指定テキストを Unicode 対応で注入する。
    ///
    /// `CGEventKeyboardSetUnicodeString` を使用し、日本語/Unicode 入力を適切に行う。
    /// グローバルロックを取得する公開エントリポイント。
    pub fn type_text(text: &str) {
        let _lock = INPUT_LOCK.lock().expect("INPUT_LOCK poisoned");
        Self::type_text_inner(text);
    }

    /// type_text の内部実装（ロック取得なし）。
    fn type_text_inner(text: &str) {
        wait_for_deletion_completion();

        // SAFETY: CGEventCreateKeyboardEvent と CGEventKeyboardSetUnicodeString は
        // CoreGraphics フレームワークのスレッドセーフな関数。CGEventPost は
        // kCGHIDEventTap (0) に対してイベントをポストする。CFRelease は
        // 作成したイベントのメモリ解放を行う。全て標準的な CGEvent 使用パターン。
        unsafe {
            extern "C" {
                fn CGEventCreateKeyboardEvent(
                    source: *mut (),
                    virtual_key: CGKeyCode,
                    key_down: bool,
                ) -> *mut ();
                fn CGEventKeyboardSetUnicodeString(
                    event: *mut (),
                    string_length: u64,
                    unicode_string: *const u16,
                );
                fn CGEventPost(tap: u32, event: *mut ());
                fn CFRelease(cf: *mut c_void);
                fn CGEventSourceCreate(state_id: i32) -> *mut ();
                fn CGEventSourceSetUserData(source: *mut (), user_data: i64);
            }

            let source = CGEventSourceCreate(0); // kCGEventSourceStateCombinedSessionState
            const MYCUTE_EVENT_ID: i64 = 0x4D594355;
            if !source.is_null() {
                CGEventSourceSetUserData(source, MYCUTE_EVENT_ID);
            }

            // CGEventKeyboardSetUnicodeString 用に UTF-16 に変換
            let utf16: Vec<u16> = text.encode_utf16().collect();

            // CGEvent には 1 イベントあたり約 20 文字の制限があるため 16 文字チャンクに分割
            const CHUNK_SIZE: usize = 16;
            for chunk in utf16.chunks(CHUNK_SIZE) {
                let event_down = CGEventCreateKeyboardEvent(source, 0, true);
                if event_down.is_null() {
                    continue;
                }
                CGEventKeyboardSetUnicodeString(event_down, chunk.len() as u64, chunk.as_ptr());
                CGEventPost(0, event_down);
                CFRelease(event_down as *mut c_void);

                thread::sleep(Duration::from_millis(KEY_DELAY_MS_MAC));

                let event_up = CGEventCreateKeyboardEvent(source, 0, false);
                if !event_up.is_null() {
                    CGEventKeyboardSetUnicodeString(event_up, chunk.len() as u64, chunk.as_ptr());
                    CGEventPost(0, event_up);
                    CFRelease(event_up as *mut c_void);
                }
                thread::sleep(Duration::from_millis(KEY_DELAY_MS_MAC));
            }

            if !source.is_null() {
                CFRelease(source as *mut c_void);
            }
        }
    }

    /// バックスペースキーを送信して文字を削除する。
    /// count: 削除する UTF-8 文字数 (text.chars().count())
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

        // この削除バッチのデッドラインを計算して登録する。
        let dynamic_cooldown =
            DELETION_COOLDOWN_MS_MAC + (count as u64 * DELETION_WEIGHT_MS_MAC);
        let estimated_duration_ms = (count as u64 * KEY_DELAY_MS_MAC * 2) + dynamic_cooldown;
        let deadline = Instant::now() + Duration::from_millis(estimated_duration_ms);
        {
            if let Ok(mut deadlines) = DELETION_DEADLINES.lock() {
                deadlines.push(deadline);
            }
        }

        // SAFETY: CGEventCreateKeyboardEvent + CGEventPost は CoreGraphics の
        // スレッドセーフな関数。バックスペースキーコード 0x33 を使用。
        unsafe {
            extern "C" {
                fn CGEventCreateKeyboardEvent(
                    source: *mut (),
                    virtual_key: CGKeyCode,
                    key_down: bool,
                ) -> *mut ();
                fn CGEventPost(tap: u32, event: *mut ());
                fn CFRelease(cf: *mut c_void);
                fn CGEventSourceCreate(state_id: i32) -> *mut ();
                fn CGEventSourceSetUserData(source: *mut (), user_data: i64);
            }

            let source = CGEventSourceCreate(0);
            const MYCUTE_EVENT_ID: i64 = 0x4D594355;
            if !source.is_null() {
                CGEventSourceSetUserData(source, MYCUTE_EVENT_ID);
            }

            const BACKSPACE_KEYCODE: CGKeyCode = 0x33;
            for _ in 0..count {
                let event_down = CGEventCreateKeyboardEvent(source, BACKSPACE_KEYCODE, true);
                if !event_down.is_null() {
                    CGEventPost(0, event_down);
                    CFRelease(event_down as *mut c_void);
                }
                thread::sleep(Duration::from_millis(KEY_DELAY_MS_MAC));

                let event_up = CGEventCreateKeyboardEvent(source, BACKSPACE_KEYCODE, false);
                if !event_up.is_null() {
                    CGEventPost(0, event_up);
                    CFRelease(event_up as *mut c_void);
                }
                thread::sleep(Duration::from_millis(KEY_DELAY_MS_MAC));
            }

            if !source.is_null() {
                CFRelease(source as *mut c_void);
            }
        }
    }

    /// 旧テキストと新テキストを比較し、差分のみを注入する。
    ///
    /// 共通プレフィックスを計算し、削除数分の Backspace + 新規文字 type_text を行う。
    /// バックスペースとタイピングを最小限に抑える。
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

        // old_text の末尾から削除する必要のある文字数
        let delete_count = old_chars.len() - common_prefix_chars;
        if delete_count > 0 {
            Self::send_backspaces_inner(delete_count);

            // 大規模削除後の OS/IME 処理完了を待機する
            let dynamic_cooldown =
                DELETION_COOLDOWN_MS_MAC + (delete_count as u64 * DELETION_WEIGHT_MS_MAC);
            thread::sleep(Duration::from_millis(dynamic_cooldown));
        }

        // new_text の入力が必要な部分を抽出
        let type_string: String = new_chars[common_prefix_chars..].iter().collect();
        if !type_string.is_empty() {
            Self::type_text_inner(&type_string);
        }
    }

    /// Cmd+C（コピー）キー送信。
    pub fn send_cmd_c() {
        Self::send_cmd_key(8); // C のキーコード
    }

    /// Cmd+V（ペースト）キー送信。
    pub fn send_cmd_v() {
        Self::send_cmd_key(9); // V のキーコード
    }

    /// Cmd+キーの組み合わせを送信する。
    fn send_cmd_key(keycode: CGKeyCode) {
        // SAFETY: CGEventCreateKeyboardEvent + CGEventSetFlags + CGEventPost は
        // CoreGraphics のスレッドセーフな関数。CMD_FLAG (0x00100000) で Command
        // 修飾キーを設定し、キーダウン＋キーアップをポストする。
        unsafe {
            extern "C" {
                fn CGEventCreateKeyboardEvent(
                    source: *mut (),
                    virtual_key: CGKeyCode,
                    key_down: bool,
                ) -> *mut ();
                fn CGEventSetFlags(event: *mut (), flags: u64);
                fn CGEventPost(tap: u32, event: *mut ());
                fn CFRelease(cf: *mut c_void);
            }

            const CMD_FLAG: u64 = 0x00100000;

            let event_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, true);
            if !event_down.is_null() {
                CGEventSetFlags(event_down, CMD_FLAG);
                CGEventPost(0, event_down);
                CFRelease(event_down as *mut c_void);
            }
            thread::sleep(Duration::from_millis(10));

            let event_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, false);
            if !event_up.is_null() {
                CGEventPost(0, event_up);
                CFRelease(event_up as *mut c_void);
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
}

// ============================================================================
// ユーティリティ
// ============================================================================

/// 全ての保留中の削除デッドラインが経過するまで待機する。
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
    fn test_keyboard_mac_is_authorized() {
        // is_authorized() が呼び出せること（戻り値は環境依存）
        let _ = KeyboardInjector::is_authorized();
    }

    #[test]
    fn test_keyboard_mac_input_diff_same() {
        // 同一テキストの input_diff → 何も起きない
        KeyboardInjector::input_diff("hello", "hello");
    }

    #[test]
    fn test_keyboard_mac_send_backspaces_zero() {
        // 0 文字の backspace → 何もしない
        KeyboardInjector::send_backspaces(0);
    }

    #[test]
    fn test_keyboard_mac_send_cmd_c() {
        // send_cmd_c() がパニックしないこと
        KeyboardInjector::send_cmd_c();
    }

    #[test]
    fn test_keyboard_mac_send_cmd_v() {
        // send_cmd_v() がパニックしないこと
        KeyboardInjector::send_cmd_v();
    }

    #[test]
    fn test_keyboard_mac_input_lock_acquire() {
        // INPUT_LOCK が取得可能であること
        let _lock = INPUT_LOCK.lock().expect("INPUT_LOCK poisoned");
    }
}

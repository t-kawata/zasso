//! Windows ホットキー監視（rdev + GetAsyncKeyState ポーリング）
//!
//! # 移植元
//!
//! `mycute/src/hotkey_win.rs` (527行) からの移植。
//! 改善点:
//! - `lazy_static!` → lazy_static 使用（voiput 既存依存）
//! - 関数名を動詞始まりに変更
//! - `static mut` → Atomic 型に置き換え
//!
//! # 設計
//!
//! rdev listener スレッドはフォーカス喪失時でも Alt を検出できる。
//! GetAsyncKeyState ポーリングスレッドはフォーカス時に rdev が Alt を
//! 捕捉できない問題の対策。二重発火は共有 atomic フラグで防止する。
//!
//! 2回目の Alt 押下（ダブルタップ）は KeyPress 時に `PENDING_ALT_START` または
//! `PENDING_ALT_FLUSH` フラグを立て、KeyRelease で遅延発火する。

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};

use rdev::{listen, Event, EventType, Key};
use tokio::sync::mpsc;

use crate::constants::{HOTKEY_DOUBLE_TAP_MAX_MS, HOTKEY_DOUBLE_TAP_MIN_MS};
use crate::hotkey::HotkeyAction;

// ============================================================================
// 修飾子ビットマスク
// ============================================================================

pub(crate) const MOD_ALT: u8 = 1 << 0;
pub(crate) const MOD_CTRL: u8 = 1 << 1;
pub(crate) const MOD_SHIFT: u8 = 1 << 2;
pub(crate) const MOD_WIN: u8 = 1 << 3;

pub(crate) const VK_MENU: u16 = 0x12;
pub(crate) const VK_CONTROL: u16 = 0x11;

// ============================================================================
// FFI 宣言
// ============================================================================

#[link(name = "user32")]
extern "system" {
    fn GetAsyncKeyState(v_key: i32) -> i16;
}

// ============================================================================
// グローバル状態（全 atomic — static mut 不使用）
// ============================================================================

/// 現在の修飾子キー状態（ビットマスク）
pub(crate) static CURRENT_MODIFIERS: AtomicU8 = AtomicU8::new(0);
/// 前回の Alt 押下時刻（UNIX epoch からのミリ秒）
pub(crate) static LAST_ALT_PRESS_TIME: AtomicU64 = AtomicU64::new(0);
/// 監視アクティブフラグ
pub(crate) static MONITORING_ACTIVE: AtomicBool = AtomicBool::new(true);
/// rdev listener が既に起動済みか
static LISTENER_SPAWNED: AtomicBool = AtomicBool::new(false);
/// 保留中の Start アクション（KeyRelease で発火）
pub(crate) static PENDING_ALT_START: AtomicBool = AtomicBool::new(false);
/// 保留中の BufferFlush アクション（KeyRelease で発火）
pub(crate) static PENDING_ALT_FLUSH: AtomicBool = AtomicBool::new(false);
/// 録音中フラグ
pub(crate) static RECORDING_ACTIVE: AtomicBool = AtomicBool::new(false);
/// Ctrl+Alt コンボ検出の上昇エッジ検出フラグ
pub(crate) static ORCHESTRATOR_COMBO_ACTIVE: AtomicBool = AtomicBool::new(false);
/// Ctrl+Alt コンボ検出の前回発火時刻
pub(crate) static ORCHESTRATOR_LAST_FIRE_MS: AtomicU64 = AtomicU64::new(0);
/// GetAsyncKeyState ポーリングスレッドのアクティブ状態
static POLLING_ACTIVE: AtomicBool = AtomicBool::new(false);

/// OrchestratorInput 誤発火防止クールダウン（ミリ秒）
pub(crate) const ORCHESTRATOR_COOLDOWN_MS: u64 = 150;

// ============================================================================
// グローバル送信者
// ============================================================================

lazy_static::lazy_static! {
    pub(crate) static ref HOTKEY_SENDER: std::sync::Mutex<Option<std::sync::mpsc::SyncSender<HotkeyAction>>> = std::sync::Mutex::new(None);
}

// ============================================================================
// 公開 API
// ============================================================================

/// 録音中フラグを設定する。
pub fn set_recording_active(active: bool) {
    RECORDING_ACTIVE.store(active, Ordering::SeqCst);
    if !active {
        // 録音終了時は保留中の Flush フラグをクリアする
        PENDING_ALT_FLUSH.store(false, Ordering::SeqCst);
    }
}

/// ホットキー監視を停止する。
///
/// MONITORING_ACTIVE を false に設定し、ポーリングスレッドを終了させる。
pub fn stop_monitoring() {
    MONITORING_ACTIVE.store(false, Ordering::SeqCst);

    // 送信側チャンネルを明示的に破棄し、ハンドラーループを終了させる
    if let Ok(mut guard) = HOTKEY_SENDER.lock() {
        *guard = None;
    }
    // ポーリングスレッドは MONITORING_ACTIVE のチェックにより自律終了する
}

// ============================================================================
// HotkeyDef — ホットキー定義
// ============================================================================

pub(crate) struct HotkeyDef {
    pub(crate) key: String,
    pub(crate) modifiers: u8,
}

impl HotkeyDef {
    pub(crate) fn matches(&self, key: &str, current_modifiers: u8) -> bool {
        self.key == key && self.modifiers == current_modifiers
    }
}

/// アクティブなホットキー設定
pub(crate) struct ActiveHotkeys {
    pub(crate) correct: HotkeyDef,
    pub(crate) summarize: HotkeyDef,
}

impl ActiveHotkeys {
    pub(crate) fn from_keys(
        correct_keys: &[String],
        summarize_keys: &[String],
    ) -> Self {
        Self {
            correct: parse_hotkey(correct_keys),
            summarize: parse_hotkey(summarize_keys),
        }
    }
}

// ============================================================================
// HotkeyMonitor — 公開エントリポイント
// ============================================================================

/// Windows ホットキー監視器。
pub struct HotkeyMonitor;

impl HotkeyMonitor {
    /// 新しいホットキーモニターを作成する。
    pub fn new() -> Self {
        Self
    }

    /// 別スレッドでホットキーの監視を開始する。
    ///
    /// ホットキーアクションの非同期レシーバーを返す。
    /// rdev listener スレッド + GetAsyncKeyState ポーリングスレッドを起動する。
    pub fn start(self) -> mpsc::Receiver<HotkeyAction> {
        let (async_tx, async_rx) = mpsc::channel::<HotkeyAction>(10);
        let (sync_tx, sync_rx) = std::sync::mpsc::sync_channel::<HotkeyAction>(10);

        // 送信者をグローバルに保存
        {
            let mut guard = HOTKEY_SENDER.lock().unwrap();
            *guard = Some(sync_tx);
        }

        // 同期→非同期ブリッジ
        let async_tx_clone = async_tx.clone();
        std::thread::spawn(move || {
            while let Ok(action) = sync_rx.recv() {
                let _ = async_tx_clone.blocking_send(action);
            }
        });

        // 監視アクティブを明示的に設定
        MONITORING_ACTIVE.store(true, Ordering::SeqCst);

        // rdev listener スレッド（初回のみ起動）
        if !LISTENER_SPAWNED.swap(true, Ordering::SeqCst) {
            log::info!("Starting Windows hotkey listener thread (first time)");
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));

                if let Err(e) = listen(move |event: Event| {
                    handle_event(event);
                }) {
                    log::error!("Failed to start rdev listener: {:?}", e);
                }
            });
        } else {
            log::info!("Windows hotkey listener thread already running. Resumed.");
        }

        // GetAsyncKeyState ポーリングスレッド（初回のみ起動）
        if !POLLING_ACTIVE.swap(true, Ordering::SeqCst) {
            log::info!("Starting GetAsyncKeyState Alt polling thread");
            std::thread::spawn(move || {
                run_alt_monitoring();
            });
        } else {
            log::info!("GetAsyncKeyState Alt polling thread already running");
        }

        async_rx
    }
}

// ============================================================================
// rdev イベントハンドラ
// ============================================================================

fn handle_event(event: Event) {
    match event.event_type {
        EventType::KeyPress(key) => {
            if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
                return;
            }

            match key {
                Key::Alt | Key::AltGr => {
                    handle_alt_key_press();
                    return;
                }
                Key::ShiftLeft | Key::ShiftRight => {
                    CURRENT_MODIFIERS.fetch_or(MOD_SHIFT, Ordering::SeqCst);
                    return;
                }
                Key::ControlLeft | Key::ControlRight => {
                    CURRENT_MODIFIERS.fetch_or(MOD_CTRL, Ordering::SeqCst);
                    check_orchestrator_combo();
                    return;
                }
                Key::MetaLeft | Key::MetaRight => {
                    CURRENT_MODIFIERS.fetch_or(MOD_WIN, Ordering::SeqCst);
                    return;
                }
                _ => {}
            }

            // ホットキーコンボ (Correct / Summarize) のチェック
            if let Some(key_str) = key_to_string(key) {
                let current_mods = CURRENT_MODIFIERS.load(Ordering::SeqCst);
                // ホットキーコンボはアクティブホットキーズを使わず、
                // 現状は MYCUTE のデフォルト動作を維持する（M8-3 で設定対応）
                // ここでは Control/Meta 修飾がない場合のみ通常キーとして扱う
                if (current_mods & MOD_CTRL) != 0 || (current_mods & MOD_WIN) != 0 {
                    return;
                }
                // 以後のキーは通常キー（ホットキーコンボ以外は無視）
                let _ = key_str;
            }

            // Control/Meta 修飾キー押下中 = ショートカット使用中 → 何もしない
            let current_mods = CURRENT_MODIFIERS.load(Ordering::SeqCst);
            if (current_mods & (MOD_CTRL | MOD_WIN)) != 0 {
                return;
            }
        }
        EventType::KeyRelease(key) => {
            match key {
                Key::Alt | Key::AltGr => {
                    handle_alt_key_release();
                }
                Key::ShiftLeft | Key::ShiftRight => {
                    CURRENT_MODIFIERS.fetch_and(!MOD_SHIFT, Ordering::SeqCst);
                }
                Key::ControlLeft | Key::ControlRight => {
                    CURRENT_MODIFIERS.fetch_and(!MOD_CTRL, Ordering::SeqCst);
                }
                Key::MetaLeft | Key::MetaRight => {
                    CURRENT_MODIFIERS.fetch_and(!MOD_WIN, Ordering::SeqCst);
                }
                _ => {}
            }
        }
        _ => {}
    }
}

// ============================================================================
// Alt キー処理（rdev 経路）
// ============================================================================

/// Alt キー押下時の処理。
///
/// ダブルタップ条件を判定し、該当する場合は PENDING フラグを立てる。
fn handle_alt_key_press() {
    let old_mods = CURRENT_MODIFIERS.fetch_or(MOD_ALT, Ordering::SeqCst);
    if (old_mods & MOD_ALT) != 0 {
        return; // 既に Alt 押下中
    }

    // Ctrl+Alt コンボ検出
    check_orchestrator_combo();
    if ORCHESTRATOR_COMBO_ACTIVE.load(Ordering::SeqCst) {
        // コンボがアクティブならダブルタップ処理をスキップ
        LAST_ALT_PRESS_TIME.store(0, Ordering::SeqCst);
        return;
    }

    let now = current_time_millis();
    let last = LAST_ALT_PRESS_TIME.load(Ordering::SeqCst);
    let diff = now.saturating_sub(last);

    if diff > HOTKEY_DOUBLE_TAP_MIN_MS && diff < HOTKEY_DOUBLE_TAP_MAX_MS {
        // ダブルタップ確定: 録音中なら Flush、非録音なら Start
        if RECORDING_ACTIVE.load(Ordering::SeqCst) {
            PENDING_ALT_FLUSH.store(true, Ordering::SeqCst);
        } else {
            PENDING_ALT_START.store(true, Ordering::SeqCst);
        }
        LAST_ALT_PRESS_TIME.store(0, Ordering::SeqCst);
    } else {
        LAST_ALT_PRESS_TIME.store(now, Ordering::SeqCst);
    }
}

/// Alt キー解放時の処理。
///
/// 保留されていた PENDING フラグを確認し、該当アクションを送出する。
fn handle_alt_key_release() {
    CURRENT_MODIFIERS.fetch_and(!MOD_ALT, Ordering::SeqCst);

    let pending_start = PENDING_ALT_START.swap(false, Ordering::SeqCst);
    let pending_flush = PENDING_ALT_FLUSH.swap(false, Ordering::SeqCst);

    if pending_start {
        if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
            return;
        }
        send_action(HotkeyAction::Start);
    }

    if pending_flush {
        if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
            return;
        }
        send_action(HotkeyAction::BufferFlush);
    }
}

// ============================================================================
// Ctrl+Alt コンボ検出
// ============================================================================

/// Control+Alt 同時押しを検出し、OrchestratorInput を送信する。
pub(crate) fn check_orchestrator_combo() {
    let mods = CURRENT_MODIFIERS.load(Ordering::SeqCst);
    let both_held = (mods & (MOD_CTRL | MOD_ALT)) == (MOD_CTRL | MOD_ALT);
    if both_held && !ORCHESTRATOR_COMBO_ACTIVE.swap(true, Ordering::SeqCst) {
        let now = current_time_millis();
        let last = ORCHESTRATOR_LAST_FIRE_MS.load(Ordering::SeqCst);
        if now.saturating_sub(last) > ORCHESTRATOR_COOLDOWN_MS {
            ORCHESTRATOR_LAST_FIRE_MS.store(now, Ordering::SeqCst);
            send_action(HotkeyAction::OrchestratorInput);
        } else {
            ORCHESTRATOR_COMBO_ACTIVE.store(false, Ordering::SeqCst);
        }
    } else if !both_held {
        ORCHESTRATOR_COMBO_ACTIVE.store(false, Ordering::SeqCst);
    }
}

// ============================================================================
// GetAsyncKeyState ポーリングスレッド
// ============================================================================

/// GetAsyncKeyState をポーリングして Alt キーの押下/解放を検出する。
///
/// rdev がフォーカス時に Alt イベントを取得できない問題の対策として、
/// 専用スレッドで 15ms 間隔のポーリングを実行する。
/// rdev と同一の atomic フラグを共有して二重発火を防止する。
fn run_alt_monitoring() {
    log::info!("[AltMonitor] GetAsyncKeyState polling started");
    let mut alt_was_pressed = false;
    let mut ctrl_was_pressed = false;

    while MONITORING_ACTIVE.load(Ordering::SeqCst) {
        // SAFETY: GetAsyncKeyState は user32.dll のスレッドセーフな関数。
        // 引数に仮想キーコードを指定し、戻り値の上位ビット (0x8000) で
        // キー押下状態を判定する。
        let is_pressed = unsafe {
            let state = GetAsyncKeyState(VK_MENU as i32);
            (state as u16 & 0x8000u16) != 0
        };
        let ctrl_is_pressed = unsafe {
            let state = GetAsyncKeyState(VK_CONTROL as i32);
            (state as u16 & 0x8000u16) != 0
        };

        if is_pressed && !alt_was_pressed {
            // ── Alt DOWN 遷移 ──
            let old_mods = CURRENT_MODIFIERS.fetch_or(MOD_ALT, Ordering::SeqCst);
            if (old_mods & MOD_ALT) == 0 {
                // Ctrl+Alt コンボ検出
                check_orchestrator_combo();
                if ORCHESTRATOR_COMBO_ACTIVE.load(Ordering::SeqCst) {
                    LAST_ALT_PRESS_TIME.store(0, Ordering::SeqCst);
                } else {
                    let now = current_time_millis();
                    let last = LAST_ALT_PRESS_TIME.load(Ordering::SeqCst);
                    let diff = now.saturating_sub(last);
                    if diff > HOTKEY_DOUBLE_TAP_MIN_MS
                        && diff < HOTKEY_DOUBLE_TAP_MAX_MS
                    {
                        // ダブルタップ確定
                        if RECORDING_ACTIVE.load(Ordering::SeqCst) {
                            PENDING_ALT_FLUSH.store(true, Ordering::SeqCst);
                        } else {
                            PENDING_ALT_START.store(true, Ordering::SeqCst);
                        }
                        LAST_ALT_PRESS_TIME.store(0, Ordering::SeqCst);
                    } else {
                        LAST_ALT_PRESS_TIME.store(now, Ordering::SeqCst);
                    }
                }
            }
        } else if !is_pressed && alt_was_pressed {
            // ── Alt UP 遷移 ──
            CURRENT_MODIFIERS.fetch_and(!MOD_ALT, Ordering::SeqCst);

            if PENDING_ALT_START.swap(false, Ordering::SeqCst) {
                if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
                    alt_was_pressed = is_pressed;
                    std::thread::sleep(std::time::Duration::from_millis(15));
                    continue;
                }
                send_action(HotkeyAction::Start);
            }

            if PENDING_ALT_FLUSH.swap(false, Ordering::SeqCst) {
                if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
                    alt_was_pressed = is_pressed;
                    std::thread::sleep(std::time::Duration::from_millis(15));
                    continue;
                }
                send_action(HotkeyAction::BufferFlush);
            }
        }

        // Ctrl 遷移処理
        if ctrl_is_pressed && !ctrl_was_pressed {
            CURRENT_MODIFIERS.fetch_or(MOD_CTRL, Ordering::SeqCst);
            check_orchestrator_combo();
        } else if !ctrl_is_pressed && ctrl_was_pressed {
            CURRENT_MODIFIERS.fetch_and(!MOD_CTRL, Ordering::SeqCst);
        }

        alt_was_pressed = is_pressed;
        ctrl_was_pressed = ctrl_is_pressed;
        std::thread::sleep(std::time::Duration::from_millis(15));
    }

    POLLING_ACTIVE.store(false, Ordering::SeqCst);
    log::info!("[AltMonitor] GetAsyncKeyState polling stopped");
}

// ============================================================================
// ユーティリティ
// ============================================================================

/// 共有送信者経由でホットキーアクションを送信する（非ブロッキング）。
fn send_action(action: HotkeyAction) {
    if let Ok(guard) = HOTKEY_SENDER.lock() {
        if let Some(ref sender) = *guard {
            let _ = sender.try_send(action);
        }
    }
}

/// rdev Key を文字列表現に変換する。
fn key_to_string(key: Key) -> Option<&'static str> {
    match key {
        Key::KeyA => Some("KeyA"),
        Key::KeyB => Some("KeyB"),
        Key::KeyC => Some("KeyC"),
        Key::KeyD => Some("KeyD"),
        Key::KeyE => Some("KeyE"),
        Key::KeyF => Some("KeyF"),
        Key::KeyG => Some("KeyG"),
        Key::KeyH => Some("KeyH"),
        Key::KeyI => Some("KeyI"),
        Key::KeyJ => Some("KeyJ"),
        Key::KeyK => Some("KeyK"),
        Key::KeyL => Some("KeyL"),
        Key::KeyM => Some("KeyM"),
        Key::KeyN => Some("KeyN"),
        Key::KeyO => Some("KeyO"),
        Key::KeyP => Some("KeyP"),
        Key::KeyQ => Some("KeyQ"),
        Key::KeyR => Some("KeyR"),
        Key::KeyS => Some("KeyS"),
        Key::KeyT => Some("KeyT"),
        Key::KeyU => Some("KeyU"),
        Key::KeyV => Some("KeyV"),
        Key::KeyW => Some("KeyW"),
        Key::KeyX => Some("KeyX"),
        Key::KeyY => Some("KeyY"),
        Key::KeyZ => Some("KeyZ"),
        Key::Num1 => Some("Key1"),
        Key::Num2 => Some("Key2"),
        Key::Num3 => Some("Key3"),
        Key::Num4 => Some("Key4"),
        Key::Num5 => Some("Key5"),
        Key::Num6 => Some("Key6"),
        Key::Num7 => Some("Key7"),
        Key::Num8 => Some("Key8"),
        Key::Num9 => Some("Key9"),
        Key::Num0 => Some("Key0"),
        _ => None,
    }
}

/// UNIX epoch からの経過ミリ秒を取得する。
fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// ホットキー文字列 ["Alt", "KeyF"] を HotkeyDef にパースする。
fn parse_hotkey(keys: &[String]) -> HotkeyDef {
    let mut modifiers = 0;
    let mut key = String::new();

    for k in keys {
        match k.as_str() {
            "Option" | "Alt" => modifiers |= MOD_ALT,
            "Control" | "Ctrl" => modifiers |= MOD_CTRL,
            "Shift" => modifiers |= MOD_SHIFT,
            "Command" | "Meta" | "Win" | "Windows" => modifiers |= MOD_WIN,
            s if s.starts_with("Key") => key = s.to_string(),
            _ => log::warn!("Unknown key/modifier in config: {}", k),
        }
    }
    HotkeyDef { key, modifiers }
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_win_current_modifiers_bit_ops() {
        // 初期状態は 0
        assert_eq!(CURRENT_MODIFIERS.load(Ordering::SeqCst), 0);

        // MOD_ALT セット
        CURRENT_MODIFIERS.fetch_or(MOD_ALT, Ordering::SeqCst);
        assert_eq!(CURRENT_MODIFIERS.load(Ordering::SeqCst), MOD_ALT);

        // MOD_CTRL 追加
        CURRENT_MODIFIERS.fetch_or(MOD_CTRL, Ordering::SeqCst);
        assert_eq!(
            CURRENT_MODIFIERS.load(Ordering::SeqCst),
            MOD_ALT | MOD_CTRL
        );

        // MOD_ALT クリア
        CURRENT_MODIFIERS.fetch_and(!MOD_ALT, Ordering::SeqCst);
        assert_eq!(CURRENT_MODIFIERS.load(Ordering::SeqCst), MOD_CTRL);

        // 全クリア
        CURRENT_MODIFIERS.store(0, Ordering::SeqCst);
        assert_eq!(CURRENT_MODIFIERS.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn test_win_set_recording_active() {
        // 初期状態は false
        assert!(!RECORDING_ACTIVE.load(Ordering::SeqCst));

        // true 設定
        set_recording_active(true);
        assert!(RECORDING_ACTIVE.load(Ordering::SeqCst));

        // false 設定
        set_recording_active(false);
        assert!(!RECORDING_ACTIVE.load(Ordering::SeqCst));

        // 録音中に PENDING_ALT_FLUSH が立っていた場合、false 設定でクリアされる
        PENDING_ALT_FLUSH.store(true, Ordering::SeqCst);
        set_recording_active(false);
        assert!(!PENDING_ALT_FLUSH.load(Ordering::SeqCst));
    }

    #[test]
    fn test_win_stop_monitoring() {
        // 停止前に Monitroing を true に設定
        MONITORING_ACTIVE.store(true, Ordering::SeqCst);
        stop_monitoring();
        assert!(!MONITORING_ACTIVE.load(Ordering::SeqCst));
    }

    #[test]
    fn test_win_parse_hotkey() {
        let def = parse_hotkey(&["Alt".to_string(), "KeyF".to_string()]);
        assert_eq!(def.key, "KeyF");
        assert_eq!(def.modifiers, MOD_ALT);
    }

    #[test]
    fn test_win_parse_hotkey_with_control() {
        let def = parse_hotkey(&[
            "Control".to_string(),
            "Alt".to_string(),
            "KeyH".to_string(),
        ]);
        assert_eq!(def.key, "KeyH");
        assert_eq!(def.modifiers, MOD_CTRL | MOD_ALT);
    }

    #[test]
    fn test_win_hotkey_def_matches() {
        let def = HotkeyDef {
            key: "KeyF".to_string(),
            modifiers: MOD_ALT,
        };

        // 一致
        assert!(def.matches("KeyF", MOD_ALT));
        // キー不一致
        assert!(!def.matches("KeyH", MOD_ALT));
        // 修飾子不一致
        assert!(!def.matches("KeyF", MOD_CTRL));
        // 両方不一致
        assert!(!def.matches("KeyH", 0));
    }

    #[test]
    fn test_win_check_orchestrator_combo() {
        // 両方押下されていない状態 → 何も起きない
        CURRENT_MODIFIERS.store(0, Ordering::SeqCst);
        check_orchestrator_combo();
        assert!(!ORCHESTRATOR_COMBO_ACTIVE.load(Ordering::SeqCst));

        // Alt のみ → コンボにならない
        CURRENT_MODIFIERS.store(MOD_ALT, Ordering::SeqCst);
        check_orchestrator_combo();
        assert!(!ORCHESTRATOR_COMBO_ACTIVE.load(Ordering::SeqCst));

        // Ctrl+Alt 両方 → コンボ検出
        CURRENT_MODIFIERS.store(MOD_CTRL | MOD_ALT, Ordering::SeqCst);
        check_orchestrator_combo();
        assert!(ORCHESTRATOR_COMBO_ACTIVE.load(Ordering::SeqCst));

        // クリア
        CURRENT_MODIFIERS.store(0, Ordering::SeqCst);
        check_orchestrator_combo();
        assert!(!ORCHESTRATOR_COMBO_ACTIVE.load(Ordering::SeqCst));
    }

    #[test]
    fn test_win_key_to_string() {
        assert_eq!(key_to_string(Key::Alt), None);
        assert_eq!(key_to_string(Key::KeyA), Some("KeyA"));
        assert_eq!(key_to_string(Key::KeyZ), Some("KeyZ"));
        assert_eq!(key_to_string(Key::Num0), Some("Key0"));
        assert_eq!(key_to_string(Key::Num9), Some("Key9"));
    }
}

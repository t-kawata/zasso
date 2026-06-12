//! CGEventTap を使用した macOS ホットキー監視
//!
//! # 移植元
//!
//! `mycute/src/hotkey_mac.rs` (406行) からの移植。
//! 改善点:
//! - `static mut` の大部分を Atomic 型に置き換え
//! - 残った unsafe ブロックに `// SAFETY:` コメントを付与
//! - 関数名を動詞始まりに変更（翻訳可能性）
//!
//! # 設計
//!
//! CGEventTap はアクセシビリティ権限が必要。ユーザーがシステム設定で許可を与えると、
//! このモジュールはグローバルなキーボードイベントを横取りし、Option キーの
//! ダブルタップを検出する。Ctrl+Option 同時押しは OrchestratorInput として別処理される。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use tokio::sync::mpsc;

use crate::constants::{HOTKEY_DOUBLE_TAP_MAX_MS, HOTKEY_DOUBLE_TAP_MIN_MS};
use crate::hotkey::HotkeyAction;

// ============================================================================
// CoreGraphics / CoreFoundation FFI 型
// ============================================================================

type CGEventRef = *mut std::ffi::c_void;
type CGEventTapProxy = *mut std::ffi::c_void;
type CGEventType = u32;
type CGEventFlags = u64;
type CGKeyCode = u16;

// ============================================================================
// CGEventTap 定数
// ============================================================================

const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
const K_CG_EVENT_FLAGS_CHANGED: CGEventType = 12;

const K_CG_EVENT_FLAG_MASK_ALTERNATE: CGEventFlags = 0x00080000;
const K_CG_EVENT_FLAG_MASK_CONTROL: CGEventFlags = 0x00040000;

const K_VK_H: CGKeyCode = 4;
const K_VK_M: CGKeyCode = 46;

const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;
const K_CG_EVENT_SOURCE_USER_DATA: u32 = 42;

// MYCUTE の自己生成イベント識別子 (ASCII "MYCU")
const MYCUTE_EVENT_TAG: i64 = 0x4D594355;

/// OrchestratorInput 誤発火防止クールダウン（ミリ秒）
const ORCHESTRATOR_COOLDOWN_MS: u64 = 150;

// ============================================================================
// CoreGraphics FFI 宣言
// ============================================================================

extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: extern "C" fn(CGEventTapProxy, CGEventType, CGEventRef, *mut std::ffi::c_void)
            -> CGEventRef,
        user_info: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;

    fn CFMachPortCreateRunLoopSource(
        allocator: *const std::ffi::c_void,
        port: *mut std::ffi::c_void,
        order: i64,
    ) -> *mut std::ffi::c_void;

    fn CFRunLoopGetCurrent() -> *mut std::ffi::c_void;
    fn CFRunLoopAddSource(
        rl: *mut std::ffi::c_void,
        source: *mut std::ffi::c_void,
        mode: *const std::ffi::c_void,
    );
    fn CFRunLoopRun();
    fn CGEventGetFlags(event: CGEventRef) -> CGEventFlags;
    fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    fn CGEventTapEnable(tap: *mut std::ffi::c_void, enable: bool);
    fn CFRunLoopStop(rl: *mut std::ffi::c_void);
}

extern "C" {
    static kCFRunLoopCommonModes: *const std::ffi::c_void;
}

// ============================================================================
// グローバル状態 — Atomic で代替可能なものは static mut を避ける
// ============================================================================

/// ホットキーアクション送信用のグローバル送信者
///
/// # Safety
///
/// CGEventTap コールバック（extern "C"）から非同期でアクセスされる。
/// コールバックは CFRunLoop スレッド上で直列化されており、本変数は
/// モニタースレッド起動時に一度だけ書き込まれ、停止時に解放される。
/// コールバック実行中は SyncSender::try_send のみ呼ばれる。
static mut HOTKEY_SENDER: Option<std::sync::mpsc::SyncSender<HotkeyAction>> = None;

/// Control キー押下状態
static CONTROL_KEY_DOWN: AtomicBool = AtomicBool::new(false);
/// Option キー押下状態
static OPTION_KEY_DOWN: AtomicBool = AtomicBool::new(false);
/// 前回の Option キー押下時刻（ミリ秒、UNIX epoch 経過）
static LAST_OPTION_PRESS_TIME: AtomicU64 = AtomicU64::new(0);

/// 停止用のグローバルランループ参照
///
/// # Safety
///
/// CFRunLoopGetCurrent() が返すポインタで、モニタースレッド内でのみ有効。
/// モニタースレッド起動時に書き込まれ、停止時にクリアされる。
static mut RUN_LOOP: Option<*mut std::ffi::c_void> = None;

/// 録音中フラグ（ホットキースレッドに状態を伝達）
static RECORDING_ACTIVE: AtomicBool = AtomicBool::new(false);
/// FLAGS_CHANGED を消費した Option キーの解放も消費するためのフラグ
static OPTION_KEY_CONSUMED: AtomicBool = AtomicBool::new(false);
/// Control+Option 同時押しの重複送信防止フラグ
static ORCHESTRATOR_COMBO_ACTIVE: AtomicBool = AtomicBool::new(false);
/// 前回の OrchestratorInput 発火時刻（ミリ秒）
static ORCHESTRATOR_LAST_FIRE_MS: AtomicU64 = AtomicU64::new(0);

// ============================================================================
// 公開 API
// ============================================================================

/// 録音中フラグを設定する。
pub fn set_recording_active(active: bool) {
    RECORDING_ACTIVE.store(active, Ordering::SeqCst);
}

/// 録音中フラグを取得する。
pub fn is_recording_active() -> bool {
    RECORDING_ACTIVE.load(Ordering::SeqCst)
}

/// ホットキー監視ランループを停止する。
pub fn stop_monitoring() {
    // SAFETY: RUN_LOOP はモニタースレッドでのみ操作される。stop_monitoring は
    // 外部スレッドから呼ばれる可能性があるが、CFRunLoopStop はスレッドセーフ。
    unsafe {
        if let Some(rl) = RUN_LOOP {
            log::info!("Stopping hotkey monitoring run loop...");
            CFRunLoopStop(rl);
            RUN_LOOP = None;
        } else {
            log::warn!("hotkey monitoring stop requested but no run loop was active.");
        }
        // 送信側チャンネルを明示的に破棄し、ハンドラーループを終了させる
        HOTKEY_SENDER = None;
    }
}

// ============================================================================
// HotkeyMonitor — 公開エントリポイント
// ============================================================================

/// CGEventTap を使用してグローバルホットキーイベントを監視する。
pub struct HotkeyMonitor;

impl HotkeyMonitor {
    /// 新しいホットキーモニターを作成する。
    pub fn new() -> Self {
        Self
    }

    /// 別スレッドでホットキーの監視を開始する。
    ///
    /// ホットキーアクションの非同期レシーバーを返す。
    /// CGEventTap 作成に失敗した場合はログ出力のみ行い、空のレシーバーを返す。
    pub fn start(self) -> mpsc::Receiver<HotkeyAction> {
        let (async_tx, async_rx) = mpsc::channel::<HotkeyAction>(10);

        // 同期チャネル → 非同期チャネルへのブリッジ
        let (sync_tx, sync_rx) = std::sync::mpsc::sync_channel::<HotkeyAction>(10);

        // SAFETY: コールバック用に送信者をグローバルに保存する。
        // この書き込みは start() の呼び出しスレッドで一度だけ行われ、
        // その後はコールバックスレッドからの読み取りのみが発生する。
        unsafe {
            HOTKEY_SENDER = Some(sync_tx);
        }

        // 同期→非同期ブリッジスレッド
        let async_tx_clone = async_tx.clone();
        std::thread::spawn(move || {
            while let Ok(action) = sync_rx.recv() {
                let _ = async_tx_clone.blocking_send(action);
            }
        });

        // イベントタップスレッドを開始する
        std::thread::spawn(move || {
            // メインイベントループの開始を待機する
            std::thread::sleep(std::time::Duration::from_millis(100));

            // SAFETY: CGEventTap 関連の FFI 呼び出しは CFRunLoop スレッド内で
            // 直列化される。tap が非 null であることを確認してから使用する。
            unsafe {
                let events_of_interest: u64 =
                    (1 << K_CG_EVENT_KEY_DOWN) | (1 << K_CG_EVENT_FLAGS_CHANGED);

                let tap = CGEventTapCreate(
                    1, // kCGSessionEventTap
                    0, // kCGHeadInsertEventTap
                    0, // kCGEventTapOptionDefault (イベント変更可)
                    events_of_interest,
                    event_tap_callback,
                    std::ptr::null_mut(),
                );

                if tap.is_null() {
                    log::error!(
                        "Failed to create CGEventTap. \
                         Make sure Accessibility permission is granted."
                    );
                    return;
                }

                log::debug!("CGEventTap created successfully");

                let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
                if source.is_null() {
                    log::error!("Failed to create run loop source");
                    return;
                }

                let run_loop = CFRunLoopGetCurrent();
                RUN_LOOP = Some(run_loop);
                CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
                CGEventTapEnable(tap, true);

                log::debug!("Hotkey monitoring started (CGEventTap)");
                CFRunLoopRun();
            }
        });

        async_rx
    }
}

// ============================================================================
// CGEventTap コールバック
// ============================================================================

/// CGEventTap コールバック関数。
///
/// FLAGS_CHANGED (type=12) で Option ダブルタップ検出 + Ctrl+Option コンボ検出。
/// KEY_DOWN (type=10) で Correct/Summarize ホットキーコンボ検出。
/// ダブルタップ確定時は `null_mut()` を返しイベントを消費（システムに伝播させない）。
extern "C" fn event_tap_callback(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: CGEventRef,
    _user_info: *mut std::ffi::c_void,
) -> CGEventRef {
    // SAFETY: CGEventTap コールバックは CFRunLoop スレッド上で直列化されて
    // 呼ばれる。グローバル状態へのアクセスは全てこのコールバック内で発生し、
    // 停止用の外部スレッド（CFRunLoopStop）との競合はない。
    unsafe {
        // ── FLAGS_CHANGED: Option キー検出・イベント消費 ──
        if event_type == K_CG_EVENT_FLAGS_CHANGED {
            return handle_flags_changed(event);
        }

        // 自己生成イベント (KeyboardInjector) は無視する
        let user_data = CGEventGetIntegerValueField(event, K_CG_EVENT_SOURCE_USER_DATA);
        if user_data == MYCUTE_EVENT_TAG {
            return event;
        }

        let keycode = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) as CGKeyCode;

        // Ctrl 押下中はショートカット（Ctrl+C 等）を優先するため無視
        if CONTROL_KEY_DOWN.load(Ordering::Relaxed) {
            return event;
        }

        // ── KEY_DOWN: ホットキーコンボ検出 (Correct / Summarize) ──
        if event_type == K_CG_EVENT_KEY_DOWN {
            return handle_key_down(event, keycode);
        }

        event
    }
}

/// FLAGS_CHANGED イベントを処理する。
///
/// Option ダブルタップ検出、Ctrl+Option コンボ検出、イベント消費を行う。
///
/// # Safety
///
/// CGEventTap コールバックコンテキスト（CFRunLoop スレッド）で呼ばれること。
unsafe fn handle_flags_changed(event: CGEventRef) -> CGEventRef {
    let flags = CGEventGetFlags(event);

    let ctrl_down = (flags & K_CG_EVENT_FLAG_MASK_CONTROL) != 0;
    CONTROL_KEY_DOWN.store(ctrl_down, Ordering::Relaxed);

    let is_option_down = (flags & K_CG_EVENT_FLAG_MASK_ALTERNATE) != 0;

    // ── OrchestratorInput: Control + Option 同時押し検出（ダブルタップより優先） ──
    if ctrl_down && is_option_down {
        if !ORCHESTRATOR_COMBO_ACTIVE.swap(true, Ordering::SeqCst) {
            // この Option 押下でダブルタップが誤検出されるのを防止するため時刻をクリア
            LAST_OPTION_PRESS_TIME.store(0, Ordering::SeqCst);

            let now = current_time_millis();
            let last = ORCHESTRATOR_LAST_FIRE_MS.load(Ordering::SeqCst);
            if now.saturating_sub(last) > ORCHESTRATOR_COOLDOWN_MS {
                ORCHESTRATOR_LAST_FIRE_MS.store(now, Ordering::SeqCst);
                if let Some(ref sender) = HOTKEY_SENDER {
                    let _ = sender.try_send(HotkeyAction::OrchestratorInput);
                }
            }
        }
        // コンボ成立中は Option キー状態を押下済みに保つ
        OPTION_KEY_DOWN.store(true, Ordering::Relaxed);
        return event;
    } else {
        ORCHESTRATOR_COMBO_ACTIVE.store(false, Ordering::SeqCst);
    }

    // ── Option キー押下遷移: ダブルタップ検出 ──
    if is_option_down && !OPTION_KEY_DOWN.load(Ordering::Relaxed) {
        let now = current_time_millis();
        let last = LAST_OPTION_PRESS_TIME.load(Ordering::SeqCst);
        let diff = now.saturating_sub(last);

        if diff > HOTKEY_DOUBLE_TAP_MIN_MS
            && diff < HOTKEY_DOUBLE_TAP_MAX_MS
        {
            // 2回目の押下: ダブルタップ確定、FLAGS_CHANGED を消費
            let action = if RECORDING_ACTIVE.load(Ordering::SeqCst) {
                HotkeyAction::BufferFlush
            } else {
                HotkeyAction::Start
            };
            if let Some(ref sender) = HOTKEY_SENDER {
                let _ = sender.try_send(action);
            }
            LAST_OPTION_PRESS_TIME.store(0, Ordering::SeqCst);
            OPTION_KEY_DOWN.store(true, Ordering::Relaxed);
            OPTION_KEY_CONSUMED.store(true, Ordering::SeqCst);
            return std::ptr::null_mut();
        } else {
            LAST_OPTION_PRESS_TIME.store(now, Ordering::SeqCst);
        }
        // 1回目の Option 押下は通過させる
    }

    // ── Option キー解放遷移: 押下を消費した場合は解放も消費 ──
    if !is_option_down
        && OPTION_KEY_DOWN.load(Ordering::Relaxed)
        && OPTION_KEY_CONSUMED.load(Ordering::Relaxed)
    {
        OPTION_KEY_CONSUMED.store(false, Ordering::SeqCst);
        OPTION_KEY_DOWN.store(false, Ordering::Relaxed);
        return std::ptr::null_mut();
    }

    OPTION_KEY_DOWN.store(is_option_down, Ordering::Relaxed);
    event
}

/// KEY_DOWN イベントを処理する（Correct / Summarize ホットキーコンボ検出）。
///
/// # Safety
///
/// CGEventTap コールバックコンテキストで呼ばれること。
unsafe fn handle_key_down(event: CGEventRef, keycode: CGKeyCode) -> CGEventRef {
    let flags = CGEventGetFlags(event);

    let mut action = None;

    // ホットキーコンボ (Correct: Option+H / Summarize: Option+M) のチェック
    if (flags & K_CG_EVENT_FLAG_MASK_ALTERNATE) != 0 {
        if keycode == K_VK_H {
            action = Some(HotkeyAction::Correct);
        } else if keycode == K_VK_M {
            action = Some(HotkeyAction::Summarize);
        }
    }

    if let Some(action) = action {
        if let Some(ref sender) = HOTKEY_SENDER {
            let _ = sender.try_send(action);
        }
        // ホットキーイベントをブロック（他のアプリに伝播させない）
        return std::ptr::null_mut();
    }

    event
}

// ============================================================================
// ユーティリティ
// ============================================================================

/// UNIX epoch からの経過ミリ秒を取得する。
fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mac_set_recording_active() {
        // 初期状態は false
        assert!(!is_recording_active());
        // true 設定→確認
        set_recording_active(true);
        assert!(is_recording_active());
        // false 設定→確認
        set_recording_active(false);
        assert!(!is_recording_active());
    }

    #[test]
    fn test_mac_new_hotkey_monitor() {
        // HotkeyMonitor::new() がパニックしないこと
        let monitor = HotkeyMonitor::new();
        // 未開始状態で start() を呼ばなければ何も起こらない
        drop(monitor);
    }

    #[test]
    fn test_mac_stop_monitoring_twice() {
        // stop_monitoring() の冪等性
        stop_monitoring();
        stop_monitoring();
        // 二重呼び出しでパニックしないこと
    }
}

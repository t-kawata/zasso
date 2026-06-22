---
ticket_id: 72
title: hotkey/ モジュール — Option/Alt ダブルタップ検出 + 録音状態管理
slug: hotkey-optionalt
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/kawata/shyme/zasso/tickets/context/0072-hotkey-optionalt/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0072-hotkey-optionalt/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0072-hotkey-optionalt/review.md
---

# hotkey/ モジュール — Option/Alt ダブルタップ検出 + 録音状態管理

## Summary

voiput crate にホットキー機能を追加する。macOS では CGEventTap、Windows では rdev/GetAsyncKeyState ポーリング + WH_KEYBOARD_LL フックを介して Option/Alt キーのダブルタップを検出し、録音開始・BufferFlush・OrchestratorInput 等のアクションを送出する。

## Background

音声認識 crate としての完成度を高めるには、アプリケーション側でホットキー監視を実装させるのではなく、voiput crate 自体がホットキー機能を内蔵することが望ましい。MYCUTE で実績のある macOS / Windows のホットキー実装を移植し、Voiput の `enable_hotkeys` 設定によって統合する。

## Scope

- `src/hotkey/mod.rs` — プラットフォーム共通トレイト + `HotkeyMonitor` 構造体 + `HotkeyAction` enum
- `src/hotkey/mac.rs` — CGEventTap による macOS 実装（移植元: `mycute/src/hotkey_mac.rs` 406行）
- `src/hotkey/win.rs` — rdev listen + GetAsyncKeyState ポーリングによる Windows 実装（移植元: `mycute/src/hotkey_win.rs` 527行）
- `src/hotkey/win_hook.rs` — WH_KEYBOARD_LL 低レベルフック（移植元: `mycute/src/hotkey_win_hook.rs` 511行）
- `src/constants.rs` — `HOTKEY_DOUBLE_TAP_MIN_MS`, `HOTKEY_DOUBLE_TAP_MAX_MS` 追加
- `Cargo.toml` — Windows: `rdev`, `winapi` 依存追加
- `lib.rs` — `mod hotkey;` 宣言 + 公開 re-export
- `voiput.rs` — `VoiputConfig` に `enable_hotkeys` / `hotkey_buffer_start` / 関連フィールド追加（Voiput 統合は M8-3 まで任意）

## Non-scope

- **クリップボード操作 + キーボード注入**（M8-2: `input/` モジュール）
- **Voiput への統合（enable_hotkeys フラグ経由の自動起動）**（M8-3）
- **test-run.rs の再構成**（M8-4）
- **実際のキーボードイベント受信の自動テスト**（CGEventTap / rdev の実機依存、後述の「ユニットテスト不可能な項目」参照）

## Investigation

### 移植元ファイルの構造

#### macOS: `~/shyme/mycute/src/hotkey_mac.rs`（406行）

- `#[link(name = "CoreGraphics", kind = "framework")]` + `#[link(name = "CoreFoundation", kind = "framework")]`
- CoreGraphics FFI: `CGEventTapCreate`, `CFMachPortCreateRunLoopSource`, `CFRunLoopGetCurrent`, `CFRunLoopAddSource`, `CFRunLoopRun`, `CGEventGetFlags`, `CGEventGetIntegerValueField`, `CGEventTapEnable`, `CFRunLoopStop`
- グローバル static mut: `ACTIVE_HOTKEYS`, `HOTKEY_SENDER`, `CONTROL_KEY_DOWN`, `OPTION_KEY_DOWN`, `LAST_OPTION_PRESS_TIME`, `RUN_LOOP`, `RECORDING_ACTIVE` (AtomicBool), `OPTION_KEY_CONSUMED`, `ORCHESTRATOR_COMBO_ACTIVE`, `ORCHESTRATOR_LAST_FIRE_MS`
- `event_tap_callback()` — FLAGS_CHANGED (type=12) で Option ダブルタップ検出 + Ctrl+Option コンボ、KEY_DOWN (type=10) で Correct/Summarize ホットキーコンボ検出
- 自己生成イベントフィルタ: `CG_EVENT_SOURCE_USER_DATA` field=42, value `0x4D594355` ("MYCU" ASCII) による識別
- `HotkeyMonitor` struct + `start(self) -> mpsc::Receiver<HotkeyAction>` — 別スレッドで CFRunLoop 起動
- `set_recording_active(bool)` — 公開API
- `stop_monitoring()` — CFRunLoopStop + HOTKEY_SENDER 解放
- `parse_hotkey()` — ["Option", "KeyS"] → (CGKeyCode, CGEventFlags)
- 定数: `Event types` KEY_DOWN=10, FLAGS_CHANGED=12
- `Event flags`: kCGEventFlagMaskAlternate=0x00080000, kCGEventFlagMaskControl=0x00040000

#### Windows: `~/shyme/mycute/src/hotkey_win.rs`（527行）

- `rdev::{listen, Event, EventType, Key}` — グローバルキーボードリスナー
- `GetAsyncKeyState` (user32) — フォーカス時に rdev が Alt を捕捉できない問題の対策
- 共有 atomic フラグ: `CURRENT_MODIFIERS` (AtomicU8 bitmask), `LAST_ALT_PRESS_TIME`, `PENDING_ALT_START`, `PENDING_ALT_FLUSH`, `RECORDING_ACTIVE`, `ORCHESTRATOR_COMBO_ACTIVE`, `ORCHESTRATOR_LAST_FIRE_MS`
- `HOTKEY_SENDER`: `lazy_static!` の `Mutex<Option<SyncSender<HotkeyAction>>>`
- `HotkeyMonitor` struct + `start(self) -> mpsc::Receiver<HotkeyAction>` — rdev スレッド + GetAsyncKeyState ポーリングスレッドを起動
- `alt_monitor_thread()` — 15ms 間隔で GetAsyncKeyState をポーリング
- `handle_event()` — rdev の KeyPress/KeyRelease コールバック
- `check_orchestrator_combo()` — Ctrl+Alt コンボ検出（150ms クールダウン）
- 修飾子ビット: `MOD_ALT=1<<0`, `MOD_CTRL=1<<1`, `MOD_SHIFT=1<<2`, `MOD_WIN=1<<3`
- `PENDING_ALT_START` / `PENDING_ALT_FLUSH` — ダブルタップ確定後、KeyRelease で遅延発火

#### Windows Hook: `~/shyme/mycute/src/hotkey_win_hook.rs`（511行）

- `SetWindowsHookExW(WH_KEYBOARD_LL=13, ...)` — 低レベルキーボードフック
- `hook_proc()` — WM_KEYDOWN/WM_SYSKEYDOWN + WM_KEYUP/WM_SYSKEYUP 処理
- Alt ダブルタップ検出時の `inject_alt_up()` (SendInput) — ブロックした Alt DOWN に対する UP 強制注入
- `MYCUTE_EVENT_TAG = 0x4D594355` — 自己生成イベントフィルタリング
- `PAYLOAD_SHARED_ATOMICS`: hotkey_win.rs と `CURRENT_MODIFIERS`, `LAST_ALT_PRESS_TIME`, `PENDING_ALT_START`, `PENDING_ALT_FLUSH` 等を共有
- `check_hook_health()` — フック異常検出 + 自動再インストール
- `start_hook()`, `stop_hook()` — 公開API
- `is_double_tap_detected()` — 時刻差判定: MIN_MS < diff < MAX_MS
- `BUFFER_FLUSH_DEDUP_MS = 50` — BufferFlush 重複送信防止ガード

### 定数

`~/shyme/mycute/src/constants.rs:93-97`:
```rust
pub const HOTKEY_DOUBLE_TAP_MIN_MS: u64 = 10;
pub const HOTKEY_DOUBLE_TAP_MAX_MS: u64 = 500;
```

### HotkeyAction enum

`~/shyme/mycute/src/types.rs:64-71`:
```rust
pub enum HotkeyAction {
    Start,
    Correct,
    Summarize,
    BufferFlush,
    OrchestratorInput,
}
```

### 既存 voiput crate の状態

- `crates/voiput/src/hotkey/` ディレクトリは未作成
- `lib.rs` に `hotkey` モジュール宣言なし
- `Cargo.toml` に `rdev` / `winapi` 依存なし
- `crates/voiput/src/constants.rs` に HOTKEY 定数なし

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | ファイル | 内容 |
|---|--------|------|----------|------|
| 1 | `hotkey_action_debug_clone_send` | 正常系 | `hotkey/mod.rs` | `HotkeyAction` 全 variant が `Debug + Clone + Send` |
| 2 | `hotkey_double_tap_min_ms` | 正常系 | `constants.rs` | `HOTKEY_DOUBLE_TAP_MIN_MS == 10` |
| 3 | `hotkey_double_tap_max_ms` | 正常系 | `constants.rs` | `HOTKEY_DOUBLE_TAP_MAX_MS == 500` |
| 4 | `mac_set_recording_active` | 正常系 | `hotkey/mac.rs` | `set_recording_active(true)` → `is_recording_active() == true` |
| 5 | `mac_set_recording_active_false` | 正常系 | `hotkey/mac.rs` | `set_recording_active(false)` → `is_recording_active() == false` |
| 6 | `mac_new_hotkey_monitor` | 正常系 | `hotkey/mac.rs` | `HotkeyMonitor::new()` がパニックしない |
| 7 | `mac_stop_monitoring_twice` | 異常系 | `hotkey/mac.rs` | `stop_monitoring()` の冪等性 |
| 8 | `mac_parse_hotkey_option_s` | 正常系 | `hotkey/mac.rs` | `parse_hotkey(["Option", "KeyS"])` → フラグ+キーコード |
| 9 | `mac_parse_hotkey_control_option_h` | 正常系 | `hotkey/mac.rs` | `parse_hotkey(["Control", "Option", "KeyH"])` |
| 10 | `mac_parse_hotkey_empty` | 異常系 | `hotkey/mac.rs` | 空リスト → 0, 0 |
| 11 | `win_current_modifiers_bit_ops` | 正常系 | `hotkey/win.rs` | `MOD_ALT`/`MOD_CTRL` ビット操作の正しさ |
| 12 | `win_set_recording_active` | 正常系 | `hotkey/win.rs` | `set_recording_active(true)` + `PENDING_ALT_FLUSH` クリア確認 |
| 13 | `win_stop_monitoring` | 正常系 | `hotkey/win.rs` | `stop_monitoring()` が `MONITORING_ACTIVE` を false にする |
| 14 | `win_parse_hotkey` | 正常系 | `hotkey/win.rs` | `parse_hotkey(["Alt", "KeyF"])` → `HotkeyDef { key: "KeyF", modifiers: MOD_ALT }` |
| 15 | `win_hotkey_def_matches` | 正常系 | `hotkey/win.rs` | `HotkeyDef::matches()` の一致/不一致テスト |
| 16 | `win_check_orchestrator_combo` | 正常系 | `hotkey/win.rs` | `check_orchestrator_combo()` の状態遷移テスト |
| 17 | `hook_is_double_tap_detected` | 正常系 | `hotkey/win_hook.rs` | `is_double_tap_detected()` の境界値テスト |
| 18 | `hook_is_alt_repeat` | 正常系 | `hotkey/win_hook.rs` | `is_alt_repeat()` の状態遷移 |
| 19 | `hook_vk_code_to_str` | 正常系 | `hotkey/win_hook.rs` | VK コード→"KeyX" 変換 |
| 20 | `hook_current_time_ms` | 正常系 | `hotkey/win_hook.rs` | `current_time_ms()` が正の値を返す |
| 21 | `hook_send_action_dedup` | 正常系 | `hotkey/win_hook.rs` | `BUFFER_FLUSH_DEDUP_MS` による重複防止 |

### ユニットテスト不可能な項目（例外）

- **実際のキーボードイベントの受信と処理**: CGEventTap / rdev の実機依存。macOS では Accessibility 許可、Windows では SetWindowsHookExW の成否が環境に依存する
- **OS のアクセシビリティ許可状態**: macOS の CGEventTap 作成はプロンプト表示とユーザー操作が必要
- **mpsc チャネル経由の非同期イベント配送**: start() は内部でスレッドを起動するため、完全な E2E テストは統合テスト（実機）でのみ実施可能

## Boy Scout Rule — 翻訳可能性計画

移植元の MYCUTE コードには以下が確認されている。voiput 移植時に改善する：

1. **関数名の翻訳可能性**: `alt_monitor_thread()` → `run_alt_monitoring_thread()`（動詞始まり）
2. **マジックナンバーの定数化**: `const K_CG_EVENT_KEY_DOWN: CGEventType = 10` 等は既に定数化済み → 維持
3. **`lazy_static!` → `once_cell::sync::Lazy` または `std::sync::LazyLock`**: 移植元が `lazy_static!` を使用している箇所は、Rust edition 2021 の `std::sync::LazyLock` もしくは `once_cell` に変更
4. **`static mut` の unsafe 軽減**: 移植元に多数の `static mut` があるが、Atomic で代替可能なものは `AtomicBool` / `AtomicU64` / `AtomicU8` に置き換える。真に `static mut` が必要な箇所（CFRunLoop ポインタ等）のみ unsafe を許容し、`// SAFETY:` コメントを付与する
5. **`unwrap()` / `unwrap_or_default()` の見直し**: `SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default()` は許容。`WINDOWS: HOTKEY_SENDER.lock().unwrap()` は `.lock()` のままエラー時にパニックではなく無視する
6. **`parse_hotkey` の改善**: macOS/Windows で重複するパースロジックは、プラットフォーム固有のキーコード変換のみ各プラットフォームに残し、修飾子パースは共通化できないか検討する

## Acceptance Criteria

- [ ] macOS: Option キーのダブルタップ（10ms〜500ms）で `HotkeyAction::Start` / `BufferFlush` が HotkeyMonitor 経由で送出される
- [ ] macOS: Ctrl+Option 同時押しで `HotkeyAction::OrchestratorInput` が送出される（150ms クールダウン）
- [ ] macOS: ダブルタップの FLAGS_CHANGED イベントが null ポインタを返し、システムに伝播しない
- [ ] macOS: 自己生成イベント（`CG_EVENT_SOURCE_USER_DATA = 0x4D594355`）は無視される
- [ ] Windows: Alt キーのダブルタップ（10ms〜500ms）で KeyRelease 時に `HotkeyAction::Start` / `BufferFlush` が送出される
- [ ] Windows: Ctrl+Alt 同時押しで `HotkeyAction::OrchestratorInput` が送出される
- [ ] Windows: rdev + GetAsyncKeyState ポーリングのデュアルパス動作（二重発火防止）
- [ ] Windows: WH_KEYBOARD_LL フック（win_hook）の開始/停止が可能
- [ ] ホットキー監視の開始/停止が冪等である（`start()` / `stop()` の二重呼び出し）
- [ ] `set_recording_active(bool)` で録音状態を設定/取得可能
- [ ] `HOTKEY_DOUBLE_TAP_MIN_MS` / `HOTKEY_DOUBLE_TAP_MAX_MS` の値が RFC と一致
- [ ] `HotkeyAction` が `Debug + Clone + Send` を実装
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストがすべて通過している

## Notes

### M8 全体の位置づけ

M8-1 は Phase 7（ホットキー音声入力の完全 crate 内蔵）の最初のチケット。ホットキーモジュールの実装に集中し、Voiput への統合（enable_hotkeys 設定）は M8-3 で行う。

### 成果物

- 計画: context/0072-hotkey-optionalt/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0072-hotkey-optionalt/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0072-hotkey-optionalt/review.md（未作成、/review-ticket 全チェック通過後に作成）

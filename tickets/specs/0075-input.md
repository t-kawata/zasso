---
ticket_id: 75
title: input/ モジュール — クリップボード操作 + キーボード注入
slug: input
status: reviewed
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: /Users/kawata/shyme/zasso/tickets/context/0075-input/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0075-input/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0075-input/review.md
---

# input/ モジュール — クリップボード操作 + キーボード注入

## Summary

voiput crate にクリップボード操作とキーボード注入を行う `input/` モジュールを追加する。arboard によるクリップボード read/write、CGEvent (macOS) / SendInput (Windows) によるキーボード注入を実装する。

## Background

音声認識結果をアプリケーションに反映するには、クリップボード経由のペースト (`save_paste_and_restore`) とキーボード注入 (`type_text`, `input_diff`) が必要。M8-1 でホットキー監視を実装したのに続き、この M8-2 で実際のテキスト入力機能を crate 内蔵する。

## Scope

- `src/input/mod.rs` — プラットフォーム分岐と公開API の再 export
- `src/input/clipboard.rs` — arboard ラッパー（全プラットフォーム共通）
- `src/input/keyboard_mac.rs` — `#[cfg(target_os = "macos")]` CGEvent キーボード注入
- `src/input/keyboard_win.rs` — `#[cfg(target_os = "windows")]` SendInput キーボード注入
- `src/constants.rs` — PASTE_DELAY_MS / KEY_DELAY / DELETION 系定数追加
- `Cargo.toml` — `arboard = "3"` 追加（全プラットフォーム）
- `lib.rs` — `pub mod input;` 宣言 + 再 export

## Non-scope

- **Voiput への統合**（M8-3）
- **test-run.rs の更新**（M8-4）
- 実際の CGEvent ポスト / SendInput 呼び出しの自動テスト（実機依存）

## Investigation

### 移植元ファイルの構造

#### `~/shyme/mycute/src/input/mod.rs`（11行）

- `pub mod clipboard;`
- `#[cfg(target_os = "macos")] pub mod keyboard_mac;` + `pub use keyboard_mac as keyboard;`
- `#[cfg(target_os = "windows")] pub mod keyboard_win;` + `pub use keyboard_win as keyboard;`

#### `~/shyme/mycute/src/input/clipboard.rs`（145行）

- `arboard` クレートを使用したクロスプラットフォームクリップボード操作
- `CLIPBOARD_LOCK: Mutex<()>` — 全クリップボード操作の排他制御
- `PASTE_DELAY_MS`: Windows 200ms / macOS 50ms（OS による非同期ペースト配送のタイミング差に対応）
- 内部関数: `get_clipboard_inner()` / `set_clipboard_inner()` — arboard ラッパー（ロックなし）
- 公開関数: `get_clipboard()`, `set_clipboard()`, `get_selected_text()`, `save_paste_and_restore()`, `replace_selected_text()` — すべて CLIPBOARD_LOCK 取得あり
- `save_paste_and_restore()`（line 95-120）: 退避→設定→Cmd+V→待機→確認後復元。クリップボードが外部変更されていた場合は復元をスキップする安全設計

#### `~/shyme/mycute/src/input/keyboard_mac.rs`（325行）

- `#[link(name = "CoreGraphics")]` + `#[link(name = "ApplicationServices")]`
- CGEvent FFI: `CGEventCreateKeyboardEvent`, `CGEventKeyboardSetUnicodeString`, `CGEventPost`, `CFRelease`, `CGEventSourceCreate`, `CGEventSourceSetUserData`, `CGEventSetFlags`
- `INPUT_LOCK: Mutex<()>` — 全キーボード注入の直列化
- `DELETION_DEADLINES: Mutex<Vec<Instant>>` — 削除完了デッドライン管理（待機時間の動的予測）
- `KeyboardInjector::is_authorized()` → `AXIsProcessTrusted()` 呼び出し
- `KeyboardInjector::input_diff(old, new)`（line 231-276）: 共通プレフィックス計算 → 削除数分 Backspace → 新規文字 type_text
- `KeyboardInjector::type_text(text)`（line 69-143）: Unicode 文字を16文字チャンク分割 + CGEventKeyboardSetUnicodeString + DOWN/UP 待機
- `KeyboardInjector::send_cmd_c()` / `send_cmd_v()`: CGEventSetFlags(CMD_FLAG=0x00100000) + CGEventPost
- `MYCUTE_EVENT_ID = 0x4D594355` — 自己生成イベントのフィルタリング用、CGEventSourceSetUserData で設定

#### `~/shyme/mycute/src/input/keyboard_win.rs`（404行）

- `SendInput` (user32) によるキーボード注入
- `INPUT_LOCK` / `DELETION_DEADLINES` / `wait_for_deletion_completion()` — macOS と同設計
- `KeyboardInjector::type_text(text)`（line 94-141）: クリップボード方式（Ctrl+V ペースト）を優先 → 失敗時 `type_text_sendinput` フォールバック
- `KeyboardInjector::type_text_sendinput(text)`（line 145-221）: SendInput KEYEVENTF_UNICODE による1文字ずつ UTF-16 打鍵
- `KeyboardInjector::input_diff(old, new)`（line 304-353）: 同上の共通プレフィックス + Backspace + type_text
- `KeyboardInjector::send_ctrl_key()` / `send_ctrl_key_inner()`: Ctrl 修飾 + キーを SendInput 4配列でアトミック送信
- `MYCUTE_EVENT_TAG = 0x4D594355` — dw_extra_info で自己イベント識別
- 構造体: `KeybdInput`（24 bytes）, `Input`（40 bytes with 64-bit padding）

#### 定数（`~/shyme/mycute/src/constants.rs`）

| 定数名 | 値 | 用途 |
|--------|----|------|
| `KEY_DELAY_MS_MAC` | 1 | macOS キーイベント間待機 |
| `KEY_DELAY_MS_WIN` | 5 | Windows キーイベント間待機 |
| `DELETION_COOLDOWN_MS_MAC` | 30 | macOS 削除後ベースクールダウン |
| `DELETION_COOLDOWN_MS_WIN` | 30 | Windows 削除後ベースクールダウン |
| `DELETION_WEIGHT_MS_MAC` | 5 | macOS 削除1文字あたり追加待機 |
| `DELETION_WEIGHT_MS_WIN` | 5 | Windows 削除1文字あたり追加待機 |

### 既存 voiput crate の状態

- `crates/voiput/src/input/` ディレクトリは未作成
- `lib.rs` に `input` モジュール宣言なし
- `Cargo.toml` に `arboard` 依存なし
- `src/constants.rs` に PASTE / KEY_DELAY / DELETION 定数なし

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | ファイル |
|---|--------|------|----------|
| 1 | `clipboard_get_set_roundtrip` | 正常系 | `input/clipboard.rs` |
| 2 | `clipboard_get_returns_empty_on_empty` | 正常系 | `input/clipboard.rs` |
| 3 | `clipboard_lock_serialization` | 正常系 | `input/clipboard.rs` |
| 4 | `clipboard_paste_delay_constants` | 検証 | `input/clipboard.rs` |
| 5 | `keyboard_mac_is_authorized` | 正常系 | `input/keyboard_mac.rs` |
| 6 | `keyboard_mac_input_diff_noop` | 正常系 | `input/keyboard_mac.rs` |
| 7 | `keyboard_mac_send_backspaces_zero` | 境界値 | `input/keyboard_mac.rs` |
| 8 | `keyboard_mac_send_cmd_c` | 正常系 | `input/keyboard_mac.rs` |
| 9 | `keyboard_mac_send_cmd_v` | 正常系 | `input/keyboard_mac.rs` |
| 10 | `keyboard_mac_input_lock_acquire` | 正常系 | `input/keyboard_mac.rs` |
| 11 | `keyboard_win_is_authorized` | 正常系 | `input/keyboard_win.rs` |
| 12 | `keyboard_win_input_diff` | 正常系 | `input/keyboard_win.rs` |
| 13 | `keyboard_win_send_backspaces_zero` | 境界値 | `input/keyboard_win.rs` |
| 14 | `keyboard_win_send_cmd_c` | 正常系 | `input/keyboard_win.rs` |
| 15 | `keyboard_win_send_cmd_v` | 正常系 | `input/keyboard_win.rs` |
| 16 | `constants_input_delay_values` | 検証 | `constants.rs` |

カバレッジ目標: 新規コード 80%以上（unsafe FFI ラッパーと型定義のみ除外）

### ユニットテスト不可能な項目（例外）

- **実際のキーボードイベント注入と他アプリへの影響**: CGEventPost / SendInput は実機依存。macOS ではアクセシビリティ権限が必要。テストでは呼び出しがパニックしないことのみ確認する
- **クリップボードの外部アプリとの競合**: 複数プロセス間のタイミング依存。手動確認のみ
- **CGEventKeyboardSetUnicodeString の文字化け**: OS/IME 依存。実機 E2E テストのみ

## Boy Scout Rule — 翻訳可能性計画

1. **関数名**: 移植元は既に動詞始まり（`get_clipboard`, `set_clipboard`, `type_text`, `input_diff` 等）→ 維持
2. **`Mutex::lock().unwrap()` → `expect()`**: `CLIPBOARD_LOCK.lock().unwrap()` は `CLIPBOARD_LOCK.lock().expect("CLIPBOARD_LOCK poisoned")` に変更し、パニック時のメッセージを明確にする
3. **`unsafe` の SAFETY コメント**: keyboard_mac.rs の CGEvent FFI、keyboard_win.rs の SendInput FFI に全 unsafe ブロックの `// SAFETY:` コメントを追加
4. **Windows type_text 設計**: クリップボード方式優先 → SendInput フォールバックの2段階設計を維持し、コメントで理由説明

## Acceptance Criteria

- [ ] `set_clipboard("test")` → `get_clipboard()` == `"test"` の往復が成立する
- [ ] `save_paste_and_restore(text)` がパニックしない（実際のペーストはテストしない）
- [ ] macOS: `KeyboardInjector::is_authorized()` が呼び出せる
- [ ] macOS: `type_text()`, `send_backspaces()`, `input_diff()`, `send_cmd_c/v()` がパニックしない
- [ ] Windows: `KeyboardInjector::is_authorized()` が `true` を返す
- [ ] Windows: 同上の全関数がパニックしない
- [ ] 全 FFI ブロックに `// SAFETY:` コメントが付与されている
- [ ] タイムアウト定数（PASTE_DELAY, KEY_DELAY, DELETION_COOLDOWN/WEIGHT）の値が MYCUTE と一致する
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストがすべて通過している

## Notes

M8-2 はクリップボード操作とキーボード注入に集中する。Voiput への統合（ホットキー受信後の自動ペースト等）は M8-3 で行う。

### 成果物

- 計画: context/0075-input/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0075-input/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0075-input/review.md（未作成、/review-ticket 全チェック通過後に作成）

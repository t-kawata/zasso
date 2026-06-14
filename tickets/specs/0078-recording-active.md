---
ticket_id: 78
title: ホットキー制御の完全修正 — RECORDING_ACTIVE連携と重複開始防止
slug: recording-active
status: reviewed
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: /Users/kawata/shyme/zasso/tickets/context/0078-recording-active/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0078-recording-active/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0078-recording-active/review.md
---

# ホットキー制御の完全修正 — RECORDING_ACTIVE連携と重複開始防止

## Summary

`voiput.rs` の `process_hotkey_action()` がホットキーモジュールの `RECORDING_ACTIVE` フラグを更新していないため、以下の3症状が発生している：

1. **2回目の Option ダブルタップが常に Start（BufferFlush が来ない）**
2. **録音中の Start が重複して準備音が鳴る**
3. **Ctrl+Option でしか停止できない（BufferFlush がない）**

macOS/Windows 両方で `set_recording_active()` / `is_recording_active()` の呼び出しを追加し、状態連携を確立する。

## Background

M8-3 で実装した `process_hotkey_action()` は、ホットキーアクションを受信して Voiput の API を呼び出すが、**ホットキーモジュール側の録音状態フラグを一切更新していない**。このため：

- macOS `hotkey/mac.rs:170`: `RECORDING_ACTIVE.load()` が常に `false`
  → ダブルタップが常に `HotkeyAction::Start` と判定される
- Windows `hotkey/win.rs:206`: `RECORDING_ACTIVE.load()` が常に `false`
  → 同様に常に Start

これは M8-3 の設計レビューで見落とされた回帰バグである。

## Scope

- `src/voiput.rs` — `process_hotkey_action()` の修正（3箇所）
- `src/hotkey/mac.rs` — `set_recording_active()` / `is_recording_active()` は既存（変更不要）
- `src/hotkey/win.rs` — 同上
- `src/voiput.rs` — テスト: process_hotkey_action が set_recording_active を呼ぶかの検証

## Non-scope

- HotkeyMonitor 自体の動作（M8-1 で実装済み、正常動作確認済み）
- 音声認識パイプライン（別問題）

## Investigation

### 問題1: RECORDING_ACTIVE が一度も更新されない

`hotkey/mac.rs:160-184` （ダブルタップ判定部）:
```rust
if is_option_down && !OPTION_KEY_DOWN {
    // ... diff 計算 ...
    if diff > MIN && diff < MAX {
        let action = if RECORDING_ACTIVE.load(Ordering::SeqCst) {
            HotkeyAction::BufferFlush   // ← 録音中なら Flush
        } else {
            HotkeyAction::Start         // ← 非録音中なら Start
        };
        // ...
    }
}
```

`RECORDING_ACTIVE` は `mac::set_recording_active()` でのみ更新されるが、**Voiput 側から一度も呼ばれていない**。
`hotkey/win.rs:206` も同様。

### 問題2: process_hotkey_action の Start に録音中チェックがない

`voiput.rs:258-268`:
```rust
HotkeyAction::Start => {
    log::info!("[Hotkey] Start: 録音開始");
    self.mode = InputMode::Buffered;
    self.buffer.clear();
    self.current_text.clear();
    self.is_post_correcting = false;
    self.recognizer.start();           // ← is_running() チェックなし
    play_ready_sound();                // ← 録音中でも毎回鳴る
}
```

既に録音中でも無条件で start() + play_ready_sound() が呼ばれる。

### 問題3: BufferFlush に set_recording_active(false) がない

`voiput.rs:269-285` （BufferFlush ハンドラ）:
```rust
HotkeyAction::BufferFlush => {
    // ... paste_at_cursor ...
    self.recognizer.stop();
    self.buffer.clear();
    self.current_text.clear();
    // ← stop しても set_recording_active(false) がない
}
```

認識を停止しても `RECORDING_ACTIVE` は `true` のまま。次回ダブルタップも `Start` にならない（フラグが true なので BufferFlush が出る）が、認識器は既に停止している。

### 問題4: Windows も同様の欠落

`hotkey/win.rs` の `RECORDING_ACTIVE` も `win::set_recording_active()` でしか更新されず、Voiput から呼ばれていない。

### コード全体像

```
process_hotkey_action() [voiput.rs]
  ├── Start → recognizer.start() + play_ready_sound()
  │            ← ここで mac::set_recording_active(true) が必要
  │            ← かつ is_running() チェックが必要
  ├── BufferFlush → paste + recognizer.stop() + clear
  │                 ← ここで mac::set_recording_active(false) が必要
  └── OrchestratorInput → mode切替 + recognizer.stop()
                          ← ここでも mac::set_recording_active(false) が必要
```

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | ファイル | 内容 |
|---|--------|------|----------|------|
| 1 | `process_hotkey_start_sets_recording_active` | 正常系 | `voiput.rs` | Start 処理後、mac::is_recording_active() が true |
| 2 | `process_hotkey_start_idempotent` | 正常系 | `voiput.rs` | 録音中に Start が来ても再開始しない |
| 3 | `process_hotkey_buffer_flush_clears_recording_active` | 正常系 | `voiput.rs` | BufferFlush 処理後、mac::is_recording_active() が false |
| 4 | `process_hotkey_orchestrator_clears_recording_active` | 正常系 | `voiput.rs` | OrchestratorInput 処理後、mac::is_recording_active() が false |
| 5 | 既存全テスト回帰 | 回帰 | — | 155テスト通過 |

注意: テスト 1-4 は `#[cfg(target_os = "macos")]` またはプラットフォーム抽象化が必要。テスト関数内で `cfg!(...)` 分岐して両プラットフォームでコンパイル可能にする。

### ユニットテスト不可能な項目（例外）

- 実際の CGEventTap ダブルタップ検出（実機依存、M8-4 の手動確認のみ）

## Boy Scout Rule — 翻訳可能性計画

- `process_hotkey_action()` の各分岐に「状態遷移の3要素（開始処理/フラグ更新/エフェクト）」をコメントで明示
- `set_recording_active` はプラットフォーム共通 helper 関数 `update_hotkey_recording_state()` を作成し、cfg 分岐を一箇所にまとめる

## Acceptance Criteria

- [ ] Option 2回押し → 録音開始（準備音）
- [ ] 録音中にもう一度 Option 2回押し → BufferFlush（ペースト＋確定音）→ 停止
- [ ] 録音中に Start が再送されても無視される（準備音が重複しない）
- [ ] Ctrl+Option → 録音停止＋モード切替（RECORDING_ACTIVE も false）
- [ ] Windows でも同様の動作
- [ ] 全既存テスト通過

## Notes

### 依存・関連チケット

| チケット | 関係 | 説明 |
|---------|------|------|
| M8-1 (#72) | 先行実装 | hotkey/mac.rs, hotkey/win.rs の set_recording_active はここで実装済み |
| M8-3 (#76) | 修正対象 | process_hotkey_action() でフラグ未更新のバグを持つ |

### 成果物

- 計画: context/0078-recording-active/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0078-recording-active/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0078-recording-active/review.md（未作成、/review-ticket 全チェック通過後に作成）

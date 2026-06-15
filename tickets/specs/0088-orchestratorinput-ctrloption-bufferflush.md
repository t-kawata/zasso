---
ticket_id: 88
title: OrchestratorInput (Ctrl+Option) を BufferFlush と共通化 — モード切替スタブの修正
slug: orchestratorinput-ctrloption-bufferflush
status: done
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: /Users/kawata/shyme/zasso/tickets/context/0088-orchestratorinput-ctrloption-bufferflush/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0088-orchestratorinput-ctrloption-bufferflush/implementation.md
---
# OrchestratorInput (Ctrl+Option) を BufferFlush と共通化 — モード切替スタブの修正

## Summary

`OrchestratorInput`（Ctrl+Option）の現在の実装は無意味なモード切替スタブである。本来の目的は BufferFlush と同一のフラッシュ処理を行い、最終出力先だけが異なる（BufferFlush はクリップボードペースト、OrchestratorInput は Flushed イベント発行）。BufferFlush と共通のフラッシュメソッドに統合する。

## Background

- Ctrl+Option（OrchestratorInput）は mycute では AI オーケストレーターを起動するためのホットキー
- 現在の voiput の実装はモード切替（Buffered ↔ RealTime）という無関係な stub
- RealTime モードは test-run に実装がなく、このモード切替は死コード
- BufferFlush と OrchestratorInput の差異はフラッシュ先のみ

## Scope

### 含むもの

**修正**: `crates/voiput/src/voiput.rs` — `process_hotkey_action()` 内

1. BufferFlush のフラッシュ実行＋後処理部分を共通メソッド `flush_and_cleanup(paste_to_clipboard: bool)` として抽出
2. BufferFlush → `flush_and_cleanup(true)` を呼ぶ
3. OrchestratorInput → `flush_and_cleanup(false)` を呼ぶ（`emit_flushed` 経由で Flushed イベント発行）
4. モード切替（InputMode の切り替え）は削除
5. 遅延フラッシュ（pending_flush）の defer チェックは OrchestratorInput にも適用

### 共通化後の実装像

```rust
fn flush_and_cleanup(&mut self, paste_to_clipboard: bool) {
    let text = self.build_flush_text();
    if paste_to_clipboard && !text.is_empty() {
        crate::input::clipboard::save_paste_and_restore(&text);
        play_commit_sound();
    } else if !paste_to_clipboard {
        self.emit_flushed(text);
    }
    self.recognizer.stop();
    Self::update_recording_state(false);
    self.is_post_correcting = false;
    self.is_stt_pending = false;
    self.pending_flush = false;
    self.flush_tx = None;
    self.buffer.clear();
    self.current_text.clear();
    self.last_stt_seq = 0;
}
```

### 依存関係
- なし（独立した修正）

## Non-scope
- InputMode::RealTime 自体の削除（別チケット）
- test-run.rs の Flushed 表示変更（既存）

## Investigation

### 証拠1: 現在の OrchestratorInput は stub

**ソース**: `crates/voiput/src/voiput.rs:437-448`

```rust
HotkeyAction::OrchestratorInput => {
    log::info!("[Hotkey] OrchestratorInput: モード切替");
    if self.recognizer.is_running() { self.recognizer.stop(); }
    Self::update_recording_state(false);
    self.mode = match self.mode { ... };  // 無意味なモード切替
}
```

### 証拠2: mycute の実装

Ctrl+Option は AI オーケストレーター起動用。音声入力を停止し、蓄積テキストをオーケストレーター画面に送信する。モード切替ではない。

## Test Plan

### ユニットテスト計画

#### テスト1: OrchestratorInput の動作
- **対象**: `process_hotkey_action(HotkeyAction::OrchestratorInput)`
- **正常系**: 録音中 → 停止 + Flushed 発行 + 状態クリア
- **正常系**: 非録音中 → 何もしない
- **場所**: `src/voiput.rs #[cfg(test)]`

#### テスト2: 既存テストの非影響確認
- **対象**: 全170テスト
- **正常系**: 全てパス

### ユニットテスト不可能な項目
- 実際の Ctrl+Option 動作 — 実機+OS 権限が必要

### E2E 手動テスト計画
1. 発話 → Ctrl+Option → `📋 Flushed: <認識全文>` が表示されること
2. 発話 → Ctrl+Option → その後 Option ダブルタップ → 新セッション開始

## Boy Scout Rule — 翻訳可能性計画
- `flush_and_cleanup(paste_to_clipboard)` は「フラッシュして後処理する（ペーストするか）」と逐語訳可能

## Acceptance Criteria
- [ ] BufferFlush と OrchestratorInput のフラッシュ処理が共通化されている
- [ ] OrchestratorInput で Flushed イベントが発行される
- [ ] モード切替の死コードが削除されている
- [ ] 既存テスト全件がパスする

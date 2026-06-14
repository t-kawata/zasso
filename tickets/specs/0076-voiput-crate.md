---
ticket_id: 76
title: Voiput 拡張 — ホットキー駆動音声入力の crate 内蔵（全責務隠蔽）
slug: voiput-crate
status: reviewed
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: /Users/kawata/shyme/zasso/tickets/context/0076-voiput-crate/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0076-voiput-crate/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0076-voiput-crate/review.md
---

# Voiput 拡張 — ホットキー駆動音声入力の crate 内蔵（全責務隠蔽）

## Summary

Voiput 構造体にホットキー監視・クリップボードペースト・フラッシュ制御を統合する。`enable_hotkeys()` 一発で HotkeyMonitor が起動し、Option/Alt ダブルタップ→録音→フラッシュ→カーソルペーストの全動作が crate 内部で完結する。InputMode (RealTime/Buffered) による動作モード切替を提供する。

## Background

M8-1 で `hotkey/` モジュール、M8-2 で `input/` モジュールを実装した。M8-3 ではこれらを Voiput 構造体に統合し、アプリケーション側がホットキーイベントのディスパッチやクリップボード操作を意識せずに済むようにする。MYCUTE の `system.rs` ホットキーハンドラ + `mycute_manager.rs` の flush 制御を移植する。

## Scope

- `src/voiput.rs` — 大規模拡張（InputMode フィールド追加、enable_hotkeys/disable_hotkeys/paste_at_cursor/build_flush_text/request_flush/ 新規メソッド、ホットキーディスパッチ内部タスク）
- `src/types.rs` — `InputMode` enum (RealTime/Buffered) 追加。`SttEvent::Flushed(String)` variant 追加
- `Cargo.toml` — `tokio = { features = ["sync"] }` 確認（oneshot 用）
- `lib.rs` — re-export 追加（`InputMode`, `SttEvent::Flushed` は既存の `pub use types::*` で自動公開）

## Non-scope

- **test-run.rs の更新**（M8-4）
- 実際のホットキーイベント受信の自動テスト（実機依存）
- クリップボードペーストのカーソル注入テスト（実機依存）

## Investigation

### MYCUTE 移植元: ホットキーハンドラ

`~/shyme/mycute/src/tauri_cmd/system.rs:207-422`:

```rust
// ホットキーディスパッチ（抜粋）
while let Some(action) = hk_rx.recv().await {
  match action {
    HotkeyAction::Start => {
      // mgr.state == Idle → start_recording(mode: InputMode::Buffered)
      // stop_previous_input() + play_ready_sound() を実行
    }
    HotkeyAction::BufferFlush => {
      // オーケストレーター排他: アクティブなら無視
      // is_post_correcting || is_stt_pending → pending_flush = true
      // oneshot rx.await で flush テキスト取得後
      // save_paste_and_restore(text) + play_commit_sound() + stop_recording()
    }
    HotkeyAction::OrchestratorInput => {
      // モード切替: Recording ↔ Orchestrator
      // Recording中なら stop → is_orchestrator 有効化
      // Idleなら orchestrator モードで start
    }
  }
}
```

### MYCUTE 移植元: flush 制御

`~/shyme/mycute/src/mycute_manager.rs:59-106`:

- `request_flush()`: flush_tx を先にセット → recognizer.stop() の順で呼び出し。逆順だと競合（oneshot が送信されず rx.await 永久待機）
- `build_flush_text()`:
  - current_text 空 → buffer を返す
  - current_text starts_with buffer → current_text のみ返す（重複除去）
  - 上記以外 → buffer + current_text 連結

### MYCUTE 移植元: flush_tx 4段階発火

`~/shyme/mycute/src/mode/cl/main_of_cl.rs:605-750`:

SttEvent 受信ループ内の共通チェック:
1. **Stopped**: flush_tx がある場合 → build_flush_text()。空テキストなら flush_tx 温存
2. **PostCorrectionFinished**: is_post_correcting=false → flush_tx があれば build_flush_text() 送信
3. **PartialResult/FinalResult 処理後**: flush_tx あり + !is_post_correcting → build_flush_text() 送信。空なら温存
4. **SttCompleted**: 同上

### MYCUTE 移植元: InputMode

`~/shyme/mycute/src/types.rs:125-130`:
```rust
pub enum InputMode {
    RealTime,  // 認識結果を逐次 input_diff でカーソル注入
    Buffered,  // フラッシュ時のみテキストを確定・ペースト
}
```

### 既存 voiput crate の状態

- `voiput.rs` に Voiput 構造体あり（recognizer, event_rx, event_tx, replaces_map, engine の5フィールド）
- `enable_hotkeys()` / `disable_hotkeys()` 未実装
- `build_flush_text()` / `request_flush()` 未実装
- `InputMode` 型未定義
- `SttEvent` に `Flushed` variant なし
- types.rs に InputMode enum なし

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | ファイル | 内容 |
|---|--------|------|----------|------|
| 1 | `build_flush_text_empty_current` | 正常系 | `voiput.rs` | buffer 空 + current_text あり → current_text |
| 2 | `build_flush_text_empty_buffer` | 正常系 | `voiput.rs` | buffer あり + current_text 空 → buffer |
| 3 | `build_flush_text_prefix_match` | 正常系 | `voiput.rs` | current_text starts_with buffer → current_text（重複除去） |
| 4 | `build_flush_text_no_prefix` | 正常系 | `voiput.rs` | current_text が buffer で始まらない → buffer + current_text 連結 |
| 5 | `request_flush_oneshot` | 正常系 | `voiput.rs` | request_flush() が oneshot Receiver を返す |
| 6 | `input_mode_debug_clone_copy_partial_eq` | 正常系 | `types.rs` | InputMode の Debug+Clone+Copy+PartialEq |
| 7 | `stt_event_flushed_construct` | 正常系 | `types.rs` | SttEvent::Flushed("test") 構築 |
| 8 | `test_voiput_enable_hotkeys_unsupported` | 異常系 | `voiput.rs` | 非対応OSで enable_hotkeys() がエラーにならない |
| 9 | `test_voiput_paste_at_cursor` | 正常系 | `voiput.rs` | paste_at_cursor() がパニックしない |
| 10 | 既存全テスト通過確認 | 回帰 | — | 既存テストに影響がないこと |

### ユニットテスト不可能な項目（例外）

- **ホットキー監視の実機検証**: CGEventTap / rdev 依存。テストでは `enable_hotkeys()` が非対応OSでエラーにならないことのみ確認
- **クリップボードペーストの実際のカーソル注入**: フォアグラウンドアプリ依存。手動確認のみ
- **flush_tx 4段階発火の完全統合テスト**: SttEvent パイプラインと oneshot の結合は複雑なタイミング依存を持つ。`build_flush_text` の単体テストでカバー
- **PostCorrection の実際の LLM API 呼び出し**: ネットワーク依存

## Boy Scout Rule — 翻訳可能性計画

1. **flush_tx 4段階発火ロジック**: MYCUTE の `main_of_cl.rs` では分散して書かれていたが、voiput.rs では `flush_tx` チェックを補助メソッド `try_send_flush_text()` として抽出し、各イベントハンドラから呼び出すことで重複を排除する

2. **enable_hotkeys の cfg 設計**: macOS/Windows では HotkeyMonitor を起動し、非対応OSでは no-op にする。cfg 分岐は関数本体内部で `#[cfg]` を使い、ダミー実装を別途用意しない

3. **`unwrap()` の排除**: oneshot の `rx.await` は `Ok/Err` を match で処理し、`unwrap()` を使わない

## Acceptance Criteria

- [ ] `enable_hotkeys()` 呼び出し後、Option/Alt ダブルタップで録音開始 + Ready 音が再生される
- [ ] 録音中のダブルタップで BufferFlush が実行され、テキストがカーソル位置にペーストされる + 確定音再生
- [ ] Ctrl+Option/Ctrl+Alt で OrchestratorInput が処理される
- [ ] `build_flush_text()` が buffer/current_text の重複除去を行い正しいテキストを返す
- [ ] `request_flush()` → oneshot Receiver が返される（呼び出し側で .await できる）
- [ ] InputMode (RealTime/Buffered) が Debug+Clone+Copy+PartialEq を実装
- [ ] `SttEvent::Flushed(String)` が構築可能
- [ ] 非対応OSで `enable_hotkeys()` がエラーにならない（no-op）
- [ ] 既存全テストが通過している（回帰）
- [ ] 翻訳可能性の検証が通っている

## Notes

M8-3 は Phase 7 の3番目のチケット。M8-1 (hotkey/) と M8-2 (input/) の成果物を Voiput に統合する。test-run.rs の更新は M8-4 に含める。

### 成果物

- 計画: context/0076-voiput-crate/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0076-voiput-crate/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0076-voiput-crate/review.md（未作成、/review-ticket 全チェック通過後に作成）

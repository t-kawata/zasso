---
ticket_id: 77
title: test-run.rs 再構成 — 薄い呼び出し層 + CLI エンジン選択
slug: test-runrs-cli
status: reviewed
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: /Users/kawata/shyme/zasso/tickets/context/0077-test-runrs-cli/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0077-test-runrs-cli/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0077-test-runrs-cli/review.md
---

# test-run.rs 再構成 — 薄い呼び出し層 + CLI エンジン選択

## Summary

test-run.rs を、Voiput の薄い呼び出し層 + イベント表示ループに再構成する。CLI 引数でエンジン選択（os/openai）と各種設定を可能にし、テスト失敗時は `exit(1)` で終了する。M8-1〜M8-3 で実装したホットキー機能は `Voiput::enable_hotkeys()` 経由で自動起動する。

## Background

M8-1〜M8-3 でホットキー監視・クリップボード・flush 制御の全ロジックが Voiput crate 内部に統合された。test-run.rs はこれらの動作確認のために Voiput を起動し、イベントをコンソール表示するだけの薄い層になる。CLI 引数でエンジンやロケールを選択可能にし、テストモードと実動作モードを一元化する。

## Scope

- `src/binary/test-run.rs` — main() の再構成、CLI 引数パーサ追加、イベントループの voiput 統合、test_* 関数群は維持

## Non-scope

- 実際の音声認識バックエンドの動作（依存関係は既存）
- ホットキー・クリップボード・flush の内部ロジック（M8-1〜M8-3 で実施済み）

## Investigation

### 現状の test-run.rs の構造

**main()**:
- `--audio-verify` → `audio_verify()` を呼び出してリターン
- `--hotkeys` → `test_hotkeys()` を呼び出してリターン（M8-1 で追加したホットキーテスト）
- 引数なし → 全 `test_*()` 関数を順次実行して終了

**test_* 関数群** (13関数):
- `test_config()` — VoiputConfig の正常/異常系デモ
- `test_resampler()` — SincResampler 動作確認
- `test_interceptor()` — apply_replaces 確認
- `test_vad()` — VAD 定数確認
- `test_signal_filter()` — is_worthy_to_run_asr 確認
- `test_post_correct()` — PostCorrectionProcessor 確認
- `test_punctuation()` — Lindera 句読点挿入確認
- `test_audio()` — 効果音初期化確認
- `test_streamer()` — PseudoAsrStreamer 確認
- `test_openai()` — OpenAI バックエンド WAV 認識（--openai-key 必須）
- `test_macos()` / `test_windows()` — FFI リンク確認
- `test_voiput()` — Voiput 公開API 呼び出し確認（start/stop/flush/set_engine/health_check 等）

**既存の CLI 引数**:
- `--audio-verify` — 音声再生確認モード
- `--hotkeys` — ホットキー監視テストモード（M8-1 追加）
- `--openai-key=xxx` — OpenAI API キー（test_openai 用）
- `--base-url=xxx` — OpenAI ベース URL 設定

### 既存の `test_hotkeys()` 関数（M8-1 追加）

現在は以下を直接呼び出している:
```rust
use voiput::hotkey::mac::HotkeyMonitor; // or win::HotkeyMonitor
let receiver = HotkeyMonitor::new().start();
```
これを M8-3 で追加した `Voiput::enable_hotkeys()` + `handle_hotkey_events()` を使う形に変更する。

### 現状の制約

- `test_*` 関数にホットキー関連のロジックが混在している
- `test_hotkeys()` が standalone で動作し、Voiput を通していない
- `test_voiput()` で start/stop してもその後のイベントループがない
- テスト失敗時に exit(1) しない

## Test Plan

### ユニットテスト計画

本チケットは test-run.rs（バイナリターゲット）の変更のみ。既存の unit/integration テストに変更はなく、全て通過することを確認する。

| # | 確認方法 | 内容 |
|---|---------|------|
| 1 | `cargo run --bin test-run` | 引数なし → --engine os 相当でテスト実行→イベントループ起動 |
| 2 | `cargo run --bin test-run -- --engine os` | 明示的な os エンジン指定 |
| 3 | `cargo run --bin test-run -- --engine openai --openai-key=sk-test` | OpenAI エンジン指定 |
| 4 | `cargo run --bin test-run -- --locale en` | 英語ロケール指定 |
| 5 | 全ユニットテスト + 統合テスト回帰 | 既存テストへの影響なし確認 |

### ユニットテスト不可能な項目（例外）

- **実際の Optipn/Alt ダブルタップ動作**: 実機依存のホットキーイベント、手動確認のみ
- **OpenAI API 実際の呼び出し**: API キーおよびネットワーク依存、test_openai の既存スキップロジックを維持

## Boy Scout Rule — 翻訳可能性計画

1. **main() の明確な3段階構成**: 「テスト実行 → Voiput 構築 → イベントループ」の3段落に分け、コメントで各段落の責務を明示する
2. **CLI 引数パースの分離**: `parse_args()` 関数に抽出し、main() 内で raw args 操作をしない
3. **test_voiput() からのホットキー依存除去**: test_voiput() は Voiput 基本API（start/stop/flush/set_engine/health_check）の呼び出し確認のみに絞る
4. **`exit(1)` 明確化**: テスト失敗時は `process::exit(1)` を呼び、エラーメッセージと共に終了する

## Acceptance Criteria

- [ ] `cargo run --bin test-run -- --engine os` で全テスト実行後、ホットキー待機→Option ダブルタップで録音開始、再度ダブルタップでフラッシュ＆ペースト
- [ ] `cargo run --bin test-run -- --engine openai --openai-key=sk-xxx` で OpenAI モードが選択される
- [ ] `cargo run --bin test-run -- --locale en` で英語ロケールが設定される
- [ ] 引数なしで `--engine os --locale ja` 相当のデフォルト動作
- [ ] テスト失敗時は `exit(1)` で終了する
- [ ] 既存の `test_*()` 関数群が維持され、削除されていない
- [ ] `test_voiput()` がホットキーに依存せず、基本 API 確認のみ行う
- [ ] `--hotkeys` スタンドアロンモードが削除され、代わりに Voiput のイベントループ内でホットキーが処理される
- [ ] 全既存ユニットテスト + 統合テストが通過する

## Notes

M8-4 は Phase 7 の最後のチケット。完了後、`cargo run --bin test-run -- --engine os` 一発でテスト → ホットキー待機 → 録音 → フラッシュ → ペーストの全サイクルが動作する。

### 成果物

- 計画: context/0077-test-runrs-cli/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0077-test-runrs-cli/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0077-test-runrs-cli/review.md（未作成、/review-ticket 全チェック通過後に作成）

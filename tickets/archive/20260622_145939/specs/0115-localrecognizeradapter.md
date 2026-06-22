---
ticket_id: 115
title: LocalRecognizerAdapter の実装
slug: localrecognizeradapter
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0115-localrecognizeradapter/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0115-localrecognizeradapter/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0115-localrecognizeradapter/review.md
---
# LocalRecognizerAdapter の実装

## Summary

`crates/voiput/src/recognizer.rs` に `LocalRecognizerAdapter` 構造体を実装する。これは `OpenAIRecognizer` と同様の 3 タスク構成（ticker + capture + streamer）を持ち、`PseudoAsrStreamer<LocalRecognizer>` をラップして SpeechRecognizer から統一的に操作できるようにする。

## Background

RFC §7 のアーキテクチャでは、Local バックエンドは OpenAI バックエンドと同様に `LocalRecognizerAdapter` を介して `SpeechRecognizer` に統合される。アダプターは `start/stop/tick/set_locale/update_config` の 5 メソッドを提供し、`SpeechRecognizer` はエンジン種別に関係なく同一のインターフェースでバックエンドを操作できる。

## Scope

### 実施すること

- `crates/voiput/src/recognizer.rs` に `LocalRecognizerAdapter` 構造体を追加
  ```rust
  struct LocalRecognizerAdapter {
      streamer: Arc<Mutex<Option<PseudoAsrStreamer<LocalRecognizer>>>>,
      tx: mpsc::Sender<SttEvent>,
      language: LocaleCode,
  }
  ```
- `impl LocalRecognizerAdapter`:
  - `pub fn new(tx: mpsc::Sender<SttEvent>, config: &VoiputConfig) -> Result<Self>`
  - `pub fn start(&mut self)`
  - `pub fn stop(&mut self)`
  - `pub fn set_locale(&mut self, locale: LocaleCode)`
  - `pub fn update_config(&mut self, config: &VoiputConfig) -> Result<()>`
- 内部で `LocalRecognizer::new()` を呼び出し、`PseudoAsrStreamer` でラップ
- OpenAIRecognizer と同等の初期化パターンに従う
- `cargo check` 0 errors / 0 warnings

### 実施しないこと

- SpeechRecognizer の dispatch 分岐追加（M6-1）
- PseudoAsrStreamer 自体の修正
- OpenAIRecognizer の修正

## Investigation

### 現在の recognizer.rs

`recognizer.rs` に `SpeechRecognizer` 構造体とその impl が定義されている。`LocalRecognizerAdapter` は `OpenAIRecognizer`（`backends/openai.rs`）と同様のパターンで実装する。

### OpenAIRecognizer のパターン

- `tx: mpsc::Sender<SttEvent>` — イベント送信
- `streamer: Arc<Mutex<Option<PseudoAsrStreamer<OpenAIBackend>>>>` — ストリーマー（遅延初期化）
- その他のフィールド（設定等）

### 依存チケット

- M5-1 (#114): ✅ reviewed（LocalRecognizer）
- 後続: M6-1 (SpeechRecognizer dispatch) — 本アダプターを使用

## Test Plan

### ユニットテスト計画

1. `test_adapter_new` — 正常系: 正しい config で adapter が生成されること
2. `test_adapter_new_missing_config` — 異常系: qwen3_asr_config None → エラー
3. `test_adapter_set_locale` — set_locale が内部ロケールを更新すること
4. `test_adapter_stop_start_restart` — stop→start の再開がエラーなく動作すること

### ユニットテスト不可能な項目（例外）

実モデルを使った transcribe の結合テストは M8-1 で実施。

## Boy Scout Rule — 翻訳可能性計画

`LocalRecognizerAdapter` — 「ローカル認識器アダプター」— 名詞として自然。
`start/stop/tick/set_locale/update_config` — OpenAIRecognizer と一貫性がある。

## Acceptance Criteria

- [ ] `LocalRecognizerAdapter` 構造体が `recognizer.rs` に定義されていること
- [ ] `new()`, `start()`, `stop()`, `set_locale()`, `update_config()` が実装されていること
- [ ] `PseudoAsrStreamer<LocalRecognizer>` を内部に保持していること
- [ ] `cargo check` が 0 errors / 0 warnings で成功すること

## Notes

### 実装上の注意

- `unimplemented!()` / `todo!()` の使用は禁止（RFC §7 明記）
- `update_config()` は ①stop → ②再生成 → ③start の順序で実行
- `tick()` は no-op（OpenAIRecognizer と同様、PseudoAsrStreamer タスクがバックグラウンド処理を行う）

### 依存関係

- **先行実装必須**: M5-1 (#114) ✅ reviewed
- **本チケットで M5 マイルストーン完了**

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M5-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§7)

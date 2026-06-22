---
ticket_id: 49
title: M3-1: PseudoAsrStreamer + test-run.rs [STREAMER]
slug: m3-1-pseudoasrstreamer-test-runrs-streamer
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0049-m3-1-pseudoasrstreamer-test-runrs-streamer/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0049-m3-1-pseudoasrstreamer-test-runrs-streamer/review.md
---
# M3-1: PseudoAsrStreamer + test-run.rs [STREAMER]

## Summary

MYCUTE の PseudoAsrStreamer を移植する（src/pipeline/streamer.rs, ~1139行）。
AsrBackend / BackendWrapper / StreamerEvent / StreamerConfig を定義。
`cargo add hound`、test-run.rs に MockBackend モードの `[STREAMER]` 追加、Stage 6/6 に更新。

## Background

PseudoAsrStreamer は VAD → ノイズ除去 → 信号フィルタ → ASR → 句読点 → 事後補正の全パイプラインを統括するオーケストレーター。

実モデル（VAD/Denoiser）の確認は M4（実マイク入力）まで待つ。人工データでは ML モデルの正しい動作確認ができないため、M3-1 では MockBackend によるパイプライン制御フローのみテストする。

M2.5（sherpa-onnx 移行）が完了していることを前提とする。

## Scope

### 0. 依存追加

```bash
cargo add hound
```

### 1. `src/pipeline/streamer.rs`

MYCUTE `~/shyme/mycute/src/tools/pseudo_asr_streamer.rs` から移植。
変更点:
- SpeechDenoiser → `crate::pipeline::denoiser::SpeechDenoiser`
- インポートパス: `crate::tools` → `crate::pipeline`
- 信号品質フィルタ → `crate::pipeline::signal_filter::is_worthy_to_run_asr`（重複実装しない）
- VadProcessor → `crate::pipeline::vad::VadProcessor`（M2.5-2 で safe API 化済み）
- InternalResampler → `crate::pipeline::resampler::InternalResampler`
- PostCorrectionProcessor → `crate::pipeline::post_correct::PostCorrectionProcessor`

移植する全要素:
- `AsrBackend` trait（transcribe, post_correct, model_name, record_asr_usage, insert_punctuation）
- `BackendWrapper<B>`（PostCorrectionBackend impl）
- `StreamerEvent` enum（SpeechStart, SpeechEnd, PartialResult, FinalResult, PostCorrectionStarted, PostCorrectionFinished）
- `StreamerLocale` enum（Ja/En）
- `StreamerConfig` struct（VAD全設定 + 信号品質 + デノイザ + 補正設定）
- `PseudoAsrStreamer<B: AsrBackend>` struct + 全メソッド
- `Chunk`, `UtteranceQueue` 内部構造体
- Unsafe Send impl

### 2. `src/pipeline/mod.rs`

- `pub(crate) mod streamer;` 追加

### 3. `src/lib.rs`

```rust
pub use pipeline::streamer::{AsrBackend, BackendWrapper, StreamerEvent, StreamerLocale, StreamerConfig};
```

### 4. `src/bin/test-run.rs` — `[STREAMER]` MockBackend モード

- MockBackend を AsrBackend にセット
- push_samples（擬似的な sine 波形データ）→ tick() → StreamerEvent 受信の流れを表示
- SpeechStart / PartialResult / SpeechEnd / FinalResult の順序表示
- Stage 6/6 に更新

### 5. `#[cfg(test)]` — 6テスト

streamer.rs 内の `mod tests` に実装:

1. **test_mock_pipeline**: MockBackend → push_samples → tick → イベント順序確認
2. **test_empty_audio**: 空データ → start/stop 正常終了
3. **test_restart**: start → stop → start の再起動サイクル
4. **test_signal_filter_skip**: 品質閾値未満の低振幅 → ASR 呼び出されない
5. **test_utterance_queue_order**: 複数発話 → 逐次処理 → 正しい FinalResult 順序
6. **test_large_utterance_split**: max_speech_duration 超え → 自動分割

## Non-scope

- 実モデル VAD/Denoiser の精度確認 — M4（実マイク）。人工データでは検証不可
- OpenAI バックエンド — M4-2
- OS ネイティブバックエンド — M4-3/M4-4

## Investigation

### 証拠1: MYCUTE pseudo_asr_streamer.rs

`~/shyme/mycute/src/tools/pseudo_asr_streamer.rs`（1139行）。
AsrBackend, BackendWrapper, PseudoAsrStreamer, SpeechDenoiser（既に分離済み）を含む。

### 証拠2: 依存

hound はコメントアウト済み。`cargo add hound` で有効化。

### 証拠3: M2.5 完了条件

M2.5-1〜4 が完了し、`crate::pipeline::vad::VadProcessor` および `crate::pipeline::denoiser::SpeechDenoiser` が sherpa-onnx safe API を使用していること（確認済み）。

## Test Plan

### ユニットテスト計画（6テスト）

streamer.rs 内 `#[cfg(test)]`:

1. **test_mock_pipeline**: MockBackend → push_samples(sine, 4800samples) → tick × N → SpeechStart→Partial→SpeechEnd→Final の順序確認（正常系）
2. **test_empty_audio**: 空データで start → stop がパニックしない（異常系レジリエンス）
3. **test_restart**: start → stop → start → stop の再起動サイクル（ライフサイクル）
4. **test_signal_filter_skip**: 低振幅データ → MockBackend.transcribe 呼び出し回数 0（境界値）
5. **test_utterance_queue_order**: 3発話をキューイング → 3つの FinalResult が順に出力される（正常系）
6. **test_large_utterance_split**: max_speech_duration 超過 → 発話が分割される（境界値）

既存72 + 新規6 = 計78テスト PASS 見込み

### ユニットテスト不可能な項目

- 実モデル VAD/Denoiser → M4 で確認

## Boy Scout Rule

- MYCUTE からの完全移植。Denoiser 分離・API 置き換え以外のロジック変更なし
- 信号品質フィルタのロジックは signal_filter.rs の関数呼び出しで重複排除
- Unsafe Send impl に SAFETY コメント

## Acceptance Criteria

- [ ] `cargo add hound` 成功
- [ ] `cargo test` 全78テスト PASS
- [ ] `cargo run --bin test-run` で Stage 6/6 + `[STREAMER]` MockBackend デモ表示
- [ ] パイプラインの6テストが全て PASS

## Notes

- M3-1 で Phase 3 完了。Stage 6/6 に到達
- 実モデルを使った最終確認は M4（バックエンド実装完了後）

### 成果物

- 計画: context/0049-m3-1-streamer/plan.md（未作成）
- 実装サマリ: context/0049-m3-1-streamer/implementation.md（未作成）
- レビュー報告書: context/0049-m3-1-streamer/review.md（未作成）

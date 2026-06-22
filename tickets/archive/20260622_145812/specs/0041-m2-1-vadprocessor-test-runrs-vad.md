---
ticket_id: 41
title: M2-1: VadProcessor + test-run.rs [VAD]
slug: m2-1-vadprocessor-test-runrs-vad
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0041-m2-1-vadprocessor-test-runrs-vad/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0041-m2-1-vadprocessor-test-runrs-vad/review.md
---
# M2-1: VadProcessor + test-run.rs [VAD]

## Summary

MYCUTE の VadProcessor 実装を voiput `src/pipeline/vad.rs` に移植する。
sherpa-rs / sherpa-rs-sys の依存を有効化し、test-run.rs に `[VAD]` セクションを追加する。

## Background

VadProcessor は Sherpa-ONNX（Silero / TEN）をラップした音声区間検出器。PseudoAsrStreamer（M3-1）や各 OS バックエンド（M4）で使用される。Windows の非ASCIIパス問題への対処（resolve_ascii_path）も含む。

MYCUTE `~/shyme/mycute/src/tools/vad_processor.rs` から完全移植。

## Scope

### 0. 依存追加

```bash
cargo add sherpa-rs && cargo add sherpa-rs-sys
```
Cargo.toml のコメントアウト行を `cargo add` で置き換える。

### 1. `src/pipeline/vad.rs`

MYCUTE から完全移植（変更不要）：
- `VadProcessor` struct — Unsafe Send/Sync
- VadConfig / VadType（pipeline 内部型）— `crate::types` の同名型とは別
- resolve_ascii_path（Windows: GetShortPathNameW / PROGRAMDATA cache）
- テスト: window_size 確認、Windows 短縮名テスト

### 2. `src/pipeline/mod.rs`

- `pub(crate) mod vad;` 追加

### 3. `src/bin/test-run.rs`

- `test_vad()` 関数追加（モデルファイル存在時のみ実行、なければスキップ）
- Stage 5/6 に更新

## Non-scope

- SpeechDenoiser（M2-2）、PunctuationMachine（M2-3）、Audio（M2-4）

## Investigation

### 証拠1: MYCUTE の実装

`~/shyme/mycute/src/tools/vad_processor.rs`（339行）:
- VAD_SAMPLE_RATE = 16000
- VadProcessor::new() → SherpaOnnxCreateVoiceActivityDetector
- accept_waveform() → 状態更新
- Windows: GetShortPathNameW → 非ASCIIパス問題回避
- テスト: window_size、短縮名長さ一致

### 証拠2: sherpa-rs 依存の有効化

Phase 2 初のチケット。sherpa-rs / sherpa-rs-sys を cargo add する。

## Test Plan

### ユニットテスト計画

VadProcessor のテストはモデルファイルが必要。以下のみ実施：
1. window_size() が Silero=512 / Ten=256
2. Drop でのメモリリーク防止（コンパイル時）
3. Windows: GetShortPathNameW 長さ一致テスト（MYCUTE から移植）

### ユニットテスト不可能な項目

- 実 VAD モデルファイルを使った accept_waveform → モデルファイル必須のため

## Acceptance Criteria

- [ ] `cargo check` が PASS（sherpa-rs リンク成功）
- [ ] vad 関連テストが PASS
- [ ] test-run.rs `[VAD]` が表示される（モデル不在時はスキップ）

## Notes

- sherpa-rs は C++ onnxruntime へのリンクが必要。ビルド時間が長くなる
- Windows の resolve_ascii_path は winapi 依存だが、cfg ガード済み（winapi は M6-1 で有効化）

### 成果物

- 計画: context/0041-m2-1-vadprocessor/plan.md（未作成）
- 実装サマリ: context/0041-m2-1-vadprocessor/implementation.md（未作成）
- レビュー報告書: context/0041-m2-1-vadprocessor/review.md（未作成）

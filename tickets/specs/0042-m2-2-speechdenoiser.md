---
ticket_id: 42
title: M2-2: SpeechDenoiser
slug: m2-2-speechdenoiser
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0042-m2-2-speechdenoiser/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0042-m2-2-speechdenoiser/review.md
---
# M2-2: SpeechDenoiser

## Summary

MYCUTE の SpeechDenoiser（GTCRN ノイズ除去）を voiput `src/pipeline/denoiser.rs` に移植する。
`test-run.rs` への統合は M3-1 で行う（本チケットではファイル作成と単体テストまで）。

## Background

MVAD で検出した音声区間のノイズを、GTCRN (Grouped Temporal Convolutional Recurrent Network) モデルで除去する。Sherpa-ONNX の OfflineSpeechDenoiser のラッパー。

MYCUTE `~/shyme/mycute/src/tools/pseudo_asr_streamer.rs` 内の `SpeechDenoiser` struct を独立ファイルに抽出する。

## Scope

### 1. `src/pipeline/denoiser.rs`

MYCUTE の pseudo_asr_streamer.rs から SpeechDenoiser struct を抽出：
- `SpeechDenoiser` struct — `inner: *const SherpaOnnxOfflineSpeechDenoiser`
- Unsafe Send/Sync
- `new(model_path, num_threads)` — GTCRN Config 構築
- `run(samples, sample_rate)` → Result<Vec<f32>>
- `Drop` impl — リソース解放

### 2. `src/pipeline/mod.rs`

- `pub(crate) mod denoiser;` 追加

### 3. `src/lib.rs`

- `pub use pipeline::denoiser::SpeechDenoiser;` 追加（test-run.rs アクセス用）

## Non-scope

- test-run.rs `[STREAMER]` への統合と実モデルを使ったノイズ除去デモ — M3-1
- PseudoAsrStreamer 本体への統合 — M3-1

## Investigation

### 証拠1: MYCUTE の SpeechDenoiser

`~/shyme/mycute/src/tools/pseudo_asr_streamer.rs` 60〜137行目:

```rust
struct SpeechDenoiser {
    inner: *const sys::SherpaOnnxOfflineSpeechDenoiser,
}
unsafe impl Send for SpeechDenoiser {}
unsafe impl Sync for SpeechDenoiser {}

impl SpeechDenoiser {
    fn new(model_path: &str, num_threads: i32) -> Result<Self> { ... }
    fn run(&self, samples: &[f32], sample_rate: i32) -> Result<Vec<f32>> { ... }
}
impl Drop for SpeechDenoiser { ... }
```

voiput ではこの struct を `pub(crate)` に変更し、`pipeline/denoiser.rs` に独立配置する。

### 証拠2: GTCRN モデルファイル

build.rs により `models/gtcrn.onnx` が自動ダウンロードされる（M2-1 で導入済み）。
単体テストでの利用はモデルファイル依存のため、実際のノイズ除去確認は M3-1 の `[STREAMER]` で行う。

## Test Plan

### ユニットテスト計画

- Drop 実装の確認（コンパイル時。メモリリーク防止）
- null ポインタでの new → Err（モデル不在時のエラーハンドリング）

### ユニットテスト不可能な項目

- 実モデルを使った run() の動作確認 → M3-1 の [STREAMER] で実施（モデルファイルは build.rs により保証済み）

## Boy Scout Rule

- MYCUTE の内部 struct を独立ファイルに抽出し pub(crate) 化。テスト容易性向上
- `new()` / `run()` — 動詞句の関数名
- コメントは日本語で「なぜ」を説明

## Acceptance Criteria

- [ ] `cargo check` が PASS
- [ ] `cargo test` が全件 PASS
- [ ] SpeechDenoiser が独立ファイルとして抽出されていること

## Notes

- M3-1 で PseudoAsrStreamer 内から `crate::pipeline::denoiser::SpeechDenoiser` として参照される
- GTCRN モデルは `models/gtcrn.onnx` に build.rs により自動配置済み
- sherpa-rs-sys の依存は M2-1 で既に追加済み

### 成果物

- 計画: context/0042-m2-2-speechdenoiser/plan.md（未作成）
- 実装サマリ: context/0042-m2-2-speechdenoiser/implementation.md（未作成）
- レビュー報告書: context/0042-m2-2-speechdenoiser/review.md（未作成）

---
ticket_id: 37
title: M1-1: SincResampler + test-run.rs [RESAMPLER]
slug: m1-1-sincresampler-test-runrs-resampler
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0037-m1-1-sincresampler-test-runrs-resampler/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0037-m1-1-sincresampler-test-runrs-resampler/review.md
---
# M1-1: SincResampler + test-run.rs [RESAMPLER]

## Summary

MYCUTE の SincResampler 実装を voiput `src/pipeline/resampler.rs` に移植する。
test-run.rs に `[RESAMPLER]` セクションを追加し、48kHz 正弦波を 16kHz にリサンプリングするデモを表示する。

### 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/mod.rs` | 新規 | `pub(crate) mod resampler;` + コメント |
| `src/pipeline/resampler.rs` | 新規 | SincResampler 完全移植（MYCUTE からコピー、パスのみ変更） |
| `src/lib.rs` | 変更 | `// mod pipeline;` → `mod pipeline;` に有効化 |
| `src/bin/test-run.rs` | 変更 | `test_resampler()` 追加、Stage 3/6 更新 |

## Background

音声認識パイプラインでは、マイクから届く音声データを VAD（音声区間検出）が要求する 16kHz に変換する必要がある。SincResampler は rubato クレートを使用した高品質なサンプリングレート変換器で、任意の入力レート（48kHz, 44.1kHz 等）から内部処理用の 16kHz に変換する。

MYCUTE `~/shyme/mycute/src/tools/resampler.rs` には完全な実装とテストが存在し、voiput への移植は**パス修正のみで完了する**。ロジックの変更は一切不要。

本チケットはパイプライン最初のコンポーネントであり、`src/pipeline/` ディレクトリを作成して `mod pipeline;` を lib.rs で有効化する。これにより今後のパイプラインコンポーネント（vad, denoiser, streamer 等）の追加が容易になる。

## Scope

### 1. `src/pipeline/mod.rs`

- `pub(crate) mod resampler;` 宣言
- 後続チケット用のコメント（// M1-2 で追加: post_correct, // M1-3 で追加: signal_filter 等）

### 2. `src/pipeline/resampler.rs`

MYCUTE `~/shyme/mycute/src/tools/resampler.rs` から完全移植。以下の変更のみ：

- `use crate::tools::resampler::...` → 不要（同一ファイル内で完結）
- `use anyhow::Result` → テストコードで使われていないため削除しても可（移植元のまま維持）
- コメントの参照先を MYCUTE パスから voiput パスに変更

移植する内容：
- `ResamplerError` enum（CreationFailed, ProcessFailed）— Display + Error impl
- `InternalResampler` trait（process, reset）— Send 境界
- `SincResampler` struct — inner: SincFixedIn<f32>, residual: Vec<f32>, input_rate, output_rate
- `SincResampler::new(input_rate, output_rate)` — rubato パラメータ設定
- `InternalResampler for SincResampler` — process（残差管理含む）/ reset
- `SincResampler::input_rate()` / `output_rate()` — アクセサ
- `#[cfg(test)] mod tests` — 5テスト（48k→16k, reset, パススルー, 空入力, 決定論性）

### 3. `src/lib.rs`

- `// mod pipeline;` → `mod pipeline;` に変更（コメントアウト解除）
- 内部トレイトの re-export は行わない（`pub(crate)` で十分）

### 4. `src/bin/test-run.rs`

- `use voiput::pipeline::resampler::{SincResampler, InternalResampler};` を追加
  - ※ `pipeline` モジュールは `pub(crate)` のため、test-run.rs（同一 crate の bin）からアクセス可能
- `test_resampler()` 関数を新規追加：
  1. 48kHz 正弦波（4800 samples）を生成
  2. SincResampler::new(48000, 16000) でリサンプラ作成
  3. process() 実行 → 入力長と出力長を表示
  4. 出力が空でないことの確認
  5. 結果を "PASS" / "FAIL" で表示
- `main()` から `test_resampler()` を呼び出し
- Stage 表示を `Stage 3/6` に更新
- ヘルパー `show_section("RESAMPLER")` 呼び出し

## Non-scope

- PostCorrectionProcessor（M1-2）、信号品質フィルタ（M1-3）、置換辞書（M1-4）— それぞれ別チケット
- `InternalResampler` trait の voiput crate 外部への公開 — 現時点では不要
- `src/pipeline/` のその他のモジュール（vad, denoiser, streamer 等）— Phase 2 以降

## Investigation

### 証拠1: MYCUTE の SincResampler 実装の完全性

MYCUTE `~/shyme/mycute/src/tools/resampler.rs`（126行）には以下が含まれる：
- `ResamplerError`（2 variant, Display + Error）
- `InternalResampler` trait（process + reset, Send 境界）
- `SincResampler` struct + new() — rubato SincFixedIn パラメータ設定
- `InternalResampler for SincResampler` — process 実装（残差管理含む）
- アクセサ input_rate / output_rate
- 5つのテスト + テストヘルパー

voiput への移植はこのファイルを `src/pipeline/resampler.rs` にコピーし、インポートを調整するのみ。

### 証拠2: 既存の rubato 依存

M0-1 で `cargo add rubato` 済み（Cargo.toml に `rubato = "3.0.0"` として追加済み）。
追加の依存追加は不要。

### 証拠3: pipeline/mod.rs の不在

現在 `src/pipeline/` ディレクトリ自体が存在しない。M0-1/M0-2 では lib.rs で `// mod pipeline;` とコメントアウトされている。
本チケットで初めて `src/pipeline/mod.rs` を作成し、`mod pipeline;` を有効化する。

### 証拠4: test-run.rs からの pipeline モジュール参照

test-run.rs は同一 crate の binary target であるため、`pub(crate)` なモジュールにアクセス可能。
`use voiput::pipeline::resampler::{SincResampler, InternalResampler};` でインポートできる。

### 証拠5: MYCUTE のテストケース

```rust
#[test]
fn test_sinc_resampler_48k_to_16k() { /* 出力長が input/4〜input/2 */ }
#[test]
fn test_resampler_reset() { /* reset → process で空でない出力 */ }
#[test]
fn test_pass_through_same_rate() { /* 16k→16k で空でない出力 */ }
#[test]
fn test_empty_input() { /* 空スライス → 空出力 */ }
#[test]
fn test_deterministic_output() { /* 同一入力→同一出力 */ }
```

これらのテストはすべてメモリ内完結・外部依存なし。そのまま移植する。

## Test Plan

### ユニットテスト計画

resampler.rs の `#[cfg(test)] mod tests` に以下5テスト（MYCUTE から完全移植）：

1. **test_sinc_resampler_48k_to_16k**: 48kHz 正弦波（4800 samples）→ 16kHz リサンプリング → 出力長が input.len()/4 〜 input.len()/2 の範囲
2. **test_resampler_reset**: process → reset → process で空でない出力
3. **test_pass_through_same_rate**: 16kHz→16kHz パススルーで空でない出力
4. **test_empty_input**: 空スライス → 空 Vec
5. **test_deterministic_output**: 2つの独立リサンプラに同一入力 → 同一出力

既存テストへの影響確認：
- types.rs（18） + config.rs（10） + error.rs（6） + constants.rs（6） = 既存40テスト + 新規5 = 計45テスト PASS 見込み

### ユニットテスト不可能な項目

なし。全テストがメモリ内完結・決定論的。

## Boy Scout Rule — 翻訳可能性計画

- MYCUTE からの移植コードは「翻訳可能性」が既に担保されていることを確認する：
  - `SincResampler` — 名詞（リサンプラ）
  - `new()` / `process()` / `reset()` / `input_rate()` / `output_rate()` — すべて動詞句
  - 内部変数名（`inner`, `residual`, `input_rate`, `output_rate`）— すべてドメイン概念を表す
  - コメントは日本語で「なぜ」を説明（rubato パラメータ選択の理由等）
- 変更点: `use crate::tools::resampler::*` → 同一ファイル内で完結するため不要。これ以外の変更は行わない。

## Acceptance Criteria

- [ ] `cargo test` が全45テスト PASS すること
- [ ] `cargo run --bin test-run` で `[RESAMPLER]` セクションが正弦波テストの結果を表示すること
- [ ] Stage 表示が `Stage 3/6` になっていること
- [ ] リサンプラーの5テストが MYCUTE のテストと同等の検証を行っていること
- [ ] 翻訳可能性の検証が通っていること

## Notes

- InternalResampler trait は `pub(crate)` のため crate 外からは見えない。現時点では問題なし
- このチケットで rubato を使う最初のコンポーネントとなる。rubato のビルド依存（FFTW 等）は不要（pure Rust）
- `src/pipeline/mod.rs` を作成することで、今後のパイプラインコンポーネント追加の基盤ができる

### 成果物

- 計画: context/0037-m1-1-sincresampler-test-runrs-resampler/plan.md（未作成）
- 実装サマリ: context/0037-m1-1-sincresampler-test-runrs-resampler/implementation.md（未作成）
- レビュー報告書: context/0037-m1-1-sincresampler-test-runrs-resampler/review.md（未作成）

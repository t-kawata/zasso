---
ticket_id: 123
title: test-run に --engine local 対応を追加
slug: test-run-engine-local
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0123-test-run-engine-local/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0123-test-run-engine-local/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0123-test-run-engine-local/review.md
---
# test-run に --engine local 対応を追加

## Summary

`test-run` バイナリに `--engine local` オプションを追加し、Qwen3-ASR ローカル音声認識バックエンドをコマンドラインから起動できるようにする。

## Background

現在 `test-run` は `--engine os`（デフォルト）と `--engine openai` のみ対応している。Qwen3-ASR の実装が完了したため、test-run 経由でローカル音声認識をデバッグ・検証できるようにする。

## Scope

### 実施すること

- `test-run.rs` の CLI パーサーに `--engine local` の分岐を追加
- `build_voiput_config()` に `SttEngine::Local` 時の `qwen3_asr_config(...)` 設定を追加
- 必要な `use` インポートの追加
- `crates/voiput/Makefile` に `run-local` / `run-local-no-denoiser` ターゲットを追加

### 実施しないこと

- voiput クレート本体のコード変更（`lib.rs`, `types.rs`, `config.rs`, `recognizer.rs` 等）
- プロダクションコードへの一切の影響
- モデルダウンロードの仕組み（build.rs で完了済み）
- テストの追加（test-run は開発用デモツールであり自動テスト対象外）

## Investigation

### 変更対象ファイル

- `crates/voiput/src/binary/test-run.rs` — CLI パーサーと ConfigBuilder の分岐追加
- `crates/voiput/Makefile` — `run-local` / `run-local-no-denoiser` ターゲット追加

### 証拠1: CLI パーサーは `"openai"` とそれ以外の2択しかない

`test-run.rs:75-78`:
```rust
engine = match args[i].as_str() {
    "openai" => SttEngine::OpenAI,
    _ => SttEngine::Os,  // ← "local" を入力しても Os になる
};
```

### 証拠2: build_voiput_config() は OpenAi の特別処理のみ

`test-run.rs:339-348`:
```rust
// 認識エンジン用の OpenAI 設定（--engine openai の場合のみ）
if args.engine == SttEngine::OpenAI {
    if let Some(ref key) = args.openai_key {
        builder = builder.openai_config(...);
    }
}
```
`SttEngine::Local` の分岐は存在しない。

### 証拠3: 必要な型定義は既に voiput crate にある

`src/types.rs:24` — `LocalAsrKind::Qwen3Asr`
`src/types.rs:31` — `Qwen3AsrModelPaths { encoder, decoder, conv_frontend, tokenizer_dir }`
`src/types.rs:44` — `Qwen3AsrConfig { model_paths, provider, num_threads, debug }`
`src/config.rs:97` — `pub fn qwen3_asr_config(mut self, c: Qwen3AsrConfig) -> Self`

### 証拠4: モデルファイルの実体

`models/qwen3-asr/` に build.rs で自動ダウンロード済み：
- `encoder.int8.onnx`
- `decoder.int8.onnx`
- `conv_frontend.onnx`
- `tokenizer/` （vocab.json + merges.txt + tokenizer_config.json）

`model_path()` ヘルパー（`test-run.rs:126`）は `{CARGO_MANIFEST_DIR}/models/{name}` を解決するため、`model_path("qwen3-asr/encoder.int8.onnx")` でパスが得られる。

## Test Plan

変更対象は test-run バイナリであり、voiput crate 本体の自動テストとは別の位置づけ。
以下の2点で検証を完結させる。

### ユニットテスト

- 新たなテストコードは追加しない（test-run は自動テスト対象外の開発用バイナリ）
- 既存の voiput crate のユニットテスト（169件）が全て通っていることで、クレート側に影響がないことを保証する

### 動作確認（手動テスト）

以下の3パターンを手動で実行し期待通り動作することを確認する：
1. `cargo run --bin test-run -- --engine os --openai-key=` → デフォルト起動（既存動作維持）
2. `cargo run --bin test-run -- --engine openai --openai-key=sk-xxx` → OpenAI 起動（既存動作維持）
3. `cargo run --bin test-run -- --engine local --openai-key=` → Local 起動（新規）

## Boy Scout Rule — 翻訳可能性計画

- `build_voiput_config()`: 現状の OpenAi のみ分岐に Local の分岐を追加するが、責務は変わらない（ConfigBuilder の設定）ので関数分割は不要
- 既存の `let m = map.write()`（539行, 780行）は事前存在のスコープ外。触らない
- 新規追加するコードは既存スタイル（snake_case、意味のある変数名）に従う

## Acceptance Criteria

- [ ] `--engine local` で Local が選択される（`SttEngine::Local { backend: LocalAsrKind::Qwen3Asr }`）
- [ ] `--engine os` / `--engine openai` の既存動作が維持される
- [ ] `make run-local` が起動する
- [ ] `make run-local-no-denoiser` が起動する
- [ ] `make check-be` が通る
- [ ] `cargo test --lib (voiput)` 既存169件が全て通過する

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0123-test-run-engine-local/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0123-test-run-engine-local/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0123-test-run-engine-local/review.md（未作成、/review-ticket 全チェック通過後に作成）

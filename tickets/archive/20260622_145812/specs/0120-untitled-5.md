---
ticket_id: 120
title: テスト用サンプル音声ファイルの配置
slug: test-wav-fixture
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0120-untitled-5/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0120-untitled-5/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0120-untitled-5/review.md
---
# テスト用サンプル音声ファイルの配置

## Summary

既存の `crates/voiput/src/wav/sample-voice.wav` を Qwen3AsrBackend 結合テストのサンプル音声ファイルとして正式に登録する。このファイルは日本語音声「こんにちは。今日はいい天気ですね。こんな日はお散歩に行きたくなりますね。」を含む 16kHz/モノラル/7.08秒の WAV ファイルであり、M8-1 の結合テストで実際の音声認識精度を検証するために使用する。

## Background

RFC §11.2 で定義されたテスト用サンプル音声ファイルとして、ダミーの無音ファイルではなく実音声ファイルを使用する。`src/wav/sample-voice.wav` は既に voiput crate に含まれており、Cargo.toml の `include` フィールドにも `"src/wav/*.wav"` として登録済み。本チケットではこれを `tests/fixtures/` にシンボリックリンクまたはコピーして、結合テストから参照可能にする。

話者による発話内容: 「こんにちは。今日はいい天気ですね。こんな日はお散歩に行きたくなりますね。」

## Scope

### 実施すること

- `crates/voiput/tests/fixtures/` ディレクトリを作成
- `src/wav/sample-voice.wav` への参照を `tests/fixtures/sample-voice.wav` として配置
- テスト用 WAV 読み込みユーティリティ関数の追加（`tests/fixtures/mod.rs`）

### 実施しないこと

- Qwen3AsrBackend 結合テストの実装（M8-1 で実施。本チケットはフィクスチャ準備のみ）
- ffmpeg によるダミー音声の生成（既存の実音声ファイルを使用）
- build.rs の変更

## Investigation

### 既存ファイルの確認

`src/wav/sample-voice.wav`:
- フォーマット: RIFF WAVE, Microsoft PCM, 16 bit, mono
- サンプリングレート: 16000 Hz ✅（Qwen3-ASR の要求と完全一致）
- 長さ: 7.08 秒
- 内容: 日本語音声（「こんにちは。今日はいい天気ですね。こんな日はお散歩に行きたくなりますね。」）
- Cargo.toml の `include` フィールドに `"src/wav/*.wav"` として既に含まれている ✅

### M8-1 のテスト方針（M7-2 の計画に含める）

M8-1 で書くテストコードの設計方針をここで定義する。**モデルファイルが存在しない場合はテストをスキップせず、パニックさせて確実にエラーにする（build.rs がモデルをダウンロードするため、不在はビルドの前提が崩れていることを意味する）。**

```rust
#[test]
fn test_qwen3_backend_transcribe_sample() {
    // build.rs でモデルがダウンロードされている前提。
    // モデル不在はビルド前提の崩壊なので確実にエラーにする（スキップしない）。
    let config = qwen3_config_or_fail();
    let mut backend = Qwen3AsrBackend::new(&config)
        .expect("Qwen3AsrBackend::new() 失敗 — モデルファイルが破損または不存在");

    // sample-voice.wav を読み込み
    let samples = load_sample_wav();

    let result = backend.transcribe(&samples)
        .expect("transcribe() 失敗 — 音声認識実行エラー");
    // 認識結果は一字一句の完全一致ではなく、キーワードベースの部分一致で検証
    assert!(result.contains("天気") || result.contains("気"),
        "認識結果に天候に関する単語が含まれること: {}", result);
    assert!(result.contains("散歩") || result.contains("さんぽ"),
        "認識結果に散歩に関する単語が含まれること: {}", result);
    assert!(result.contains("こんにちは") || result.contains("今日"),
        "認識結果に挨拶に関する単語が含まれること: {}", result);
}
```

### 依存チケット

- 後続: M8-1 (結合テスト) — 本ファイルを使用して transcribe テストを実装
- 後続: M8-2 (最終確認) — 全テスト通過

## Test Plan

フィクスチャ自体の検証は M8-1 のテスト実行に委ねる。WAV ファイルのフォーマットは `file` コマンドで確認済み。

## Boy Scout Rule — 翻訳可能性計画

なし（既存ファイルの参照のみ）。

## Acceptance Criteria

- [ ] `crates/voiput/tests/fixtures/sample-voice.wav` から音声データが読み取れること
- [ ] `cargo check` が成功すること

## Notes

### M8-1 実装時の注意点

- 認識結果は一字一句の一致ではなく、**キーワードベースの部分一致**で検証する
- 使用するキーワード: 「天気」「散歩」「こんにちは」など
- モデル不在時は**テストを失敗させる**（build.rs が自動ダウンロードするため不在はビルド前提の崩壊）
- テスト用 WAV 読み込み関数は `tests/fixtures/mod.rs` に実装する

### 依存関係

- **先行実装必須**: なし（既存ファイルの参照のみ）
- **後続**: M8-1 (Qwen3AsrBackend 結合テスト)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M7-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§11.2, Appendix D)

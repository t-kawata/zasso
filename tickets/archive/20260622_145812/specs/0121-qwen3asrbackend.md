---
ticket_id: 121
title: Qwen3AsrBackend 結合テスト（実モデル + 実音声）
slug: qwen3asrbackend
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0121-qwen3asrbackend/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0121-qwen3asrbackend/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0121-qwen3asrbackend/review.md
---
# Qwen3AsrBackend 結合テスト（実モデル + 実音声）

## Summary

`crates/voiput/tests/qwen3_asr_test.rs` に Qwen3AsrBackend の結合テストを実装する。実際の ONNX モデルファイルと `sample-voice.wav`（日本語実音声）を使用して音声認識を実行し、認識結果に期待するキーワードが含まれていることを検証する。

モデルファイルが存在しない場合はテストを**失敗させる**（build.rs が自動ダウンロードするため、不在はビルド前提の崩壊）。

## Background

M4-2 で実装した `Qwen3AsrBackend` は sherpa-onnx の `OfflineRecognizer` をラップするが、ユニットテストではモデルファイル不在のエラーハンドリングのみ検証し、実際の音声認識はテストできていなかった。M7-1 で build.rs にモデルダウンロードを追加し、M7-2 でテストフィクスチャを準備した。本チケットでこれらを統合し、実際の音声認識パイプラインの動作を検証する。

## Scope

### 実施すること

- `crates/voiput/tests/qwen3_asr_test.rs` 作成（Rust 結合テスト）
- `test_qwen3_asr_backend_new` — 実モデルファイルで new() が成功すること
- `test_qwen3_asr_transcribe_sample` — sample-voice.wav を認識し、キーワードを含むこと
- `cargo test --test qwen3_asr_test` 全通過確認

### 実施しないこと

- ユニットテストの追加（既存の qwen3.rs `#[cfg(test)]` で十分）
- build.rs の変更（M7-1 で完了）
- WAV 読み込みユーティリティの修正（M7-2 で完了）

## Investigation

### テストファイルの構成

`tests/qwen3_asr_test.rs` — 統合テスト（`tests/` 下の `.rs` ファイルは自動的に個別のバイナリとしてコンパイルされる）。`crate::fixtures::load_sample_wav()` は統合テストから直接参照できないため、テストファイル内で `#[path]` 属性または直接パス指定で読み込む。

```rust
// tests/qwen3_asr_test.rs
use std::path::Path;
use anyhow::Result;
use sherpa_onnx::{OfflineQwen3ASRModelConfig, OfflineRecognizer, OfflineRecognizerConfig};

/// モデルファイルの存在を事前検証する（不在ならパニック → テスト失敗）。
fn qwen3_config_or_fail() -> Qwen3AsrConfig {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let model_dir = manifest_dir.join("models").join("qwen3-asr");
    assert!(model_dir.join("encoder.int8.onnx").exists(),
        "encoder.int8.onnx が見つかりません。build.rs でダウンロードされます。");
    // ... 同様に decoder, tokens も確認 ...
    Qwen3AsrConfig { ... }
}

fn load_sample_wav() -> Vec<f32> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests").join("fixtures").join("sample-voice.wav");
    let mut reader = hound::WavReader::open(&path).unwrap();
    reader.samples::<i16>().filter_map(Result::ok)
        .map(|s| s as f32 / i16::MAX as f32).collect()
}

#[test]
fn test_qwen3_asr_backend_new() {
    let config = qwen3_config_or_fail();
    let backend = Qwen3AsrBackend::new(&config);
    assert!(backend.is_ok(), "Qwen3AsrBackend::new() がエラーを返しました");
}

#[test]
fn test_qwen3_asr_transcribe_sample() {
    let config = qwen3_config_or_fail();
    let mut backend = Qwen3AsrBackend::new(&config)
        .expect("Qwen3AsrBackend::new() 失敗");
    let samples = load_sample_wav();
    let result = backend.transcribe(&samples)
        .expect("transcribe() 失敗");

    // キーワードベースの部分一致検証
    assert!(result.contains("天気") || result.contains("気"),
        "認識結果に天候に関する単語が含まれること: {}", result);
    assert!(result.contains("散歩") || result.contains("さんぽ"),
        "認識結果に散歩に関する単語が含まれること: {}", result);
    assert!(result.contains("こんにちは") || result.contains("今日"),
        "認識結果に挨拶に関する単語が含まれること: {}", result);
}
```

### 依存チケット

- M4-2 (#112): ✅ reviewed（Qwen3AsrBackend 実装）
- M7-1 (#119): ✅ reviewed（build.rs モデルダウンロード）
- M7-2 (#120): ✅ reviewed（テストフィクスチャ）
- M8-2: 後続（全テスト通過確認）

## Test Plan

本チケットの成果物がテストそのもの。2 テストケース。

## Boy Scout Rule — 翻訳可能性計画

`qwen3_config_or_fail()` — 「失敗するかQwen3設定を返す」— 説明的。
`load_sample_wav()` — 「サンプルWAVを読み込む」— 動詞句として自然。

## Acceptance Criteria

- [ ] `tests/qwen3_asr_test.rs` が作成されていること
- [ ] `test_qwen3_asr_backend_new` — 実モデルで new() が成功すること
- [ ] `test_qwen3_asr_transcribe_sample` — 実音声でキーワード検証が成功すること
- [ ] `cargo test --test qwen3_asr_test` が全通過すること
- [ ] モデルファイル不在時は**テスト失敗**（パニック）すること
- [ ] 既存の全テスト（`cargo test --lib`）に影響がないこと

## Notes

### 統合テストとユニットテストの分離

`tests/qwen3_asr_test.rs` は統合テスト（`tests/` ディレクトリ）として配置する。これにより `cargo test` では全テストが実行され、`cargo test --lib` では結合テストが除外される。

### モデル不在時の動作

build.rs が `models/qwen3-asr/` にファイルをダウンロードする前提。不在はビルドの不備を意味するため、`assert!` でパニックさせて**テスト失敗**にする（スキップしない）。

### 依存関係

- **先行実装必須**: M4-2 (#112) ✅, M7-1 (#119) ✅, M7-2 (#120) ✅
- **後続**: M8-2 (全テスト通過確認)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M8-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§11.2)

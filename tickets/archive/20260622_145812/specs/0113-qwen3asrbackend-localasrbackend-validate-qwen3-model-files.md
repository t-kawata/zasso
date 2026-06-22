---
ticket_id: 113
title: Qwen3AsrBackend の LocalAsrBackend 実装 + validate_qwen3_model_files
slug: qwen3asrbackend-localasrbackend-validate-qwen3-model-files
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0113-qwen3asrbackend-localasrbackend-validate-qwen3-model-files/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0113-qwen3asrbackend-localasrbackend-validate-qwen3-model-files/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0113-qwen3asrbackend-localasrbackend-validate-qwen3-model-files/review.md
---
# Qwen3AsrBackend の LocalAsrBackend 実装 + validate_qwen3_model_files

## Summary

`Qwen3AsrBackend` に `LocalAsrBackend` トレイトを実装し（`model_path`, `is_healthy`）、起動時のモデルファイル検証関数 `validate_qwen3_model_files()` を追加する。これにより M4-2 で残した `Qwen3AsrBackend` の `config` フィールドの `#[allow(dead_code)]` が解消される。

## Background

M1-2 で定義した `LocalAsrBackend` トレイトはローカル ASR バックエンドに固有の情報（モデルパス、ヘルスチェック）を提供する。Qwen3AsrBackend は sherpa-onnx OfflineRecognizer をラップしており、`is_healthy()` は OfflineRecognizer が作成済みであること（＝Self が存在すること）で判断する。

`validate_qwen3_model_files()` は実行時に 4 つのモデルファイルが存在するかを確認し、欠落時はエラーメッセージとともに `make download-models` の実行を促す。

## Scope

### 実施すること

- `local/qwen3.rs` に `impl LocalAsrBackend for Qwen3AsrBackend` を追加
  - `fn model_path(&self) -> &str` — encoder パスを返す
  - `fn is_healthy(&self) -> bool` — 常に `true`（Self が存在 = create 成功済み）
- `local/qwen3.rs` に `validate_qwen3_model_files(config: &Qwen3AsrConfig) -> Result<()>` を追加
  - 4 ファイルの存在チェック
  - 欠落時はエラー + `make download-models` の案内
- M4-2 の `config` フィールド `#[allow(dead_code)]` を除去
- テスト追加（`model_path`, `is_healthy`, `validate` 正常・異常系）
- `cargo check` 0 errors / 0 warnings

### 実施しないこと

- `transcribe()` や `new()` の変更（M4-2 で完了）
- 結合テスト（M8-1）
- build.rs の変更（M7-1）

## Investigation

### 現在の状態

- `local/qwen3.rs`: `Qwen3AsrBackend` struct + `AsrBackend` impl 完了 ✅
- `config` フィールド: `#[allow(dead_code)]` あり（M4-3 で除去）
- RFC §8.2 に `validate_qwen3_model_files()` のコードブロックあり

### RFC §8.2 のコード:

```rust
fn validate_qwen3_model_files(config: &Qwen3AsrConfig) -> Result<()> {
    let paths = [
        (&config.model_paths.encoder, "encoder.onnx"),
        (&config.model_paths.decoder, "decoder.onnx"),
        (&config.model_paths.joiner, "joiner.onnx"),
        (&config.model_paths.tokens, "tokens.txt"),
    ];
    for (path, name) in &paths {
        if !std::path::Path::new(path).exists() {
            anyhow::bail!("Qwen3-ASR モデルファイルが見つかりません: {} ({})\n\
              ビルド時に自動ダウンロードされます。\n\
              手動でダウンロードする場合: https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8", name, path);
        }
    }
    Ok(())
}
```

### 依存チケット

- M4-2 (#112): ✅ reviewed（Qwen3AsrBackend 実装元）
- 後続: M5-1 (LocalRecognizer), M8-1 (結合テスト)

## Test Plan

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_model_path` | 正常系 | `model_path()` が encoder パスを返す |
| 2 | `test_is_healthy` | 正常系 | `is_healthy()` が `true` |
| 3 | `test_validate_all_exist` | 正常系 | 全ファイル存在 → Ok |
| 4 | `test_validate_missing` | 異常系 | 1ファイル欠落 → Err |
| 5 | `config_field_read` | スタブ解決 | `#[allow(dead_code)]` 除去確認 |

## Boy Scout Rule — 翻訳可能性計画

`config` フィールドの `#[allow(dead_code)]` を除去しコードベースの正確性を向上。

## Acceptance Criteria

- [ ] `impl LocalAsrBackend for Qwen3AsrBackend` が実装されていること
- [ ] `validate_qwen3_model_files()` が実装されていること
- [ ] `config` フィールドの `#[allow(dead_code)]` が除去されていること
- [ ] `cargo check` が 0 errors / 0 warnings で成功すること
- [ ] 5 テストが全て通過すること

## Notes

### 実装フラグメント

```rust
impl LocalAsrBackend for Qwen3AsrBackend {
    fn model_path(&self) -> &str {
        &self.config.model_paths.encoder
    }
    fn is_healthy(&self) -> bool {
        true
    }
}

fn validate_qwen3_model_files(config: &Qwen3AsrConfig) -> Result<()> {
    // RFC §8.2 のコードブロック通り
}
```

### 依存関係

- **先行実装必須**: M4-2 (#112) ✅ reviewed
- **本チケットで M4 マイルストーン完了**

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M4-3
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§5, §8.2)

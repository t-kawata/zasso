---
ticket_id: 114
title: LocalRecognizer Facade の実装
slug: localrecognizer-facade
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0114-localrecognizer-facade/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0114-localrecognizer-facade/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0114-localrecognizer-facade/review.md
---
# LocalRecognizer Facade の実装

## Summary

`crates/voiput/src/local/recognizer.rs` の `[::STUB::]` を `LocalRecognizer` Facade 実装で置き換える。`Box<dyn LocalAsrBackend>` を内部に保持し、`AsrBackend` トレイトを実装することで `PseudoAsrStreamer` から透過的に扱えるようにする。

**本チケットで 3 つの `[::STUB::]` を一斉解決する**: `resolve_qwen3_model_paths`, `resolve_qwen3_asr_config`, `validate_qwen3_model_files` が `LocalRecognizer::new()` で初めて使用される。

## Background

RFC §6 のアーキテクチャでは、`LocalRecognizer` はローカル ASR バックエンドへの Facade として機能する。複数のローカル ASR モデル（Qwen3-ASR, 将来の Whisper / SenseVoice）を `Box<dyn LocalAsrBackend>` として統一的に扱い、`PseudoAsrStreamer` は `AsrBackend` トレイトに対してのみプログラミングされる。

## Scope

### 実施すること

- `local/recognizer.rs` に `LocalRecognizer` 構造体 + `impl` + `impl AsrBackend` を実装（RFC §6 通り）
  - `struct LocalRecognizer { backend: Box<dyn LocalAsrBackend>, kind: LocalAsrKind, locale: LocaleCode }`
  - `pub fn new(kind: LocalAsrKind, config: &VoiputConfig) -> Result<Self>`
    - 内部で `resolve_qwen3_asr_config()` を呼び `Qwen3AsrConfig` を解決
    - 内部で `validate_qwen3_model_files()` を呼びモデルファイル存在確認
    - `Qwen3AsrBackend::new()` でバックエンド生成
  - `impl AsrBackend` — `transcribe()` を `self.backend.transcribe()` に委譲
- **スタブ解決（3 件）**:
  - `recognizer.rs` の `#[allow(dead_code)] fn resolve_qwen3_model_paths` を除去
  - `recognizer.rs` の `#[allow(dead_code)] fn resolve_qwen3_asr_config` を除去
  - `local/qwen3.rs` の `#[allow(dead_code)] fn validate_qwen3_model_files` を除去
- `#[cfg(test)]` で単体テスト追加
- `cargo check` 0 errors / 0 warnings 確認

### 実施しないこと

- `LocalRecognizerAdapter`（M5-2）
- SpeechRecognizer の Local 分岐（M6-1）
- 実モデル結合テスト（M8-1）

## Investigation

### 現在のスタブ

| スタブ | ファイル | 行 | 備考 |
|--------|---------|-----|------|
| `[::STUB::]` (empty file) | `local/recognizer.rs` | 1 | M5-1 で実装 |
| `#[allow(dead_code)] resolve_qwen3_model_paths` | `recognizer.rs` | 220 | M5-1 参照 |
| `#[allow(dead_code)] resolve_qwen3_asr_config` | `recognizer.rs` | 238 | M5-1 参照 |
| `#[allow(dead_code)] validate_qwen3_model_files` | `local/qwen3.rs` | 117 | M5-1 参照 |

### RFC §6 のコードブロック

```rust
pub struct LocalRecognizer {
    backend: Box<dyn LocalAsrBackend>,
    kind: LocalAsrKind,
    locale: LocaleCode,
}

impl LocalRecognizer {
    pub fn new(kind: LocalAsrKind, config: &crate::VoiputConfig) -> Result<Self> {
        let backend: Box<dyn LocalAsrBackend> = match kind {
            LocalAsrKind::Qwen3Asr => {
                let qwen3_config = config.qwen3_asr_config.as_ref()
                    .ok_or_else(|| anyhow!("..."))?;
                // TODO: resolve_qwen3_asr_config + validate_qwen3_model_files
                Box::new(super::qwen3::Qwen3AsrBackend::new(qwen3_config)?)
            }
        };
        Ok(Self { backend, kind, locale: config.locale })
    }
}
```

### 依存チケット

- M4-1〜M4-3: ✅ reviewed（LocalRecognizer の構成要素）
- M2-5: ✅ reviewed（path resolution 関数）
- 後続: M5-2 (LocalRecognizerAdapter), M6-1 (SpeechRecognizer dispatch)

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_new_qwen3_without_config` | 異常系 | `qwen3_asr_config=None` → エラー |
| 2 | `test_new_qwen3_missing_model` | 異常系 | モデル不在 → エラー |
| 3 | `test_backend_name_qwen3` | 正常系 | `kind()` → Qwen3Asr |
| 4 | `test_kind_method` | 正常系 | `kind()` で種別取得 |

### ユニットテスト不可能な項目（例外）

実モデルを使った transcribe の結合テストは M8-1 で実施。

## Boy Scout Rule — 翻訳可能性計画

3 つの `#[allow(dead_code)]` スタブを除去し、コードベースの正確性を向上。

## Acceptance Criteria

- [ ] `local/recognizer.rs` に `LocalRecognizer` 構造体 + impl が実装されていること
- [ ] `impl AsrBackend for LocalRecognizer` で `transcribe()` が委譲されていること
- [ ] `recognizer.rs` の 2 つの `#[allow(dead_code)]` が除去されていること
- [ ] `local/qwen3.rs` の `#[allow(dead_code)] validate_qwen3_model_files` が除去されていること
- [ ] `cargo check` が 0 errors / 0 warnings で成功すること

## Notes

### 依存関係

- **先行実装必須**: M4-1〜M4-3 ✅, M2-5 ✅
- **後続**: M5-2 (LocalRecognizerAdapter)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M5-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§6)

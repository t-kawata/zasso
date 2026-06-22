---
ticket_id: 117
title: VoiputConfigBuilder の Local 検証
slug: voiputconfigbuilder-local
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0117-voiputconfigbuilder-local/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0117-voiputconfigbuilder-local/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0117-voiputconfigbuilder-local/review.md
---
# VoiputConfigBuilder の Local 検証

## Summary

`crates/voiput/src/config.rs` の `VoiputConfigBuilder::build()` に `SttEngine::Local` 時のバリデーションを追加する。`qwen3_asr_config` が `None` の場合にエラーを返す。併せて `#[allow(dead_code)]` の 2 関数（`resolve_qwen3_model_paths`, `resolve_qwen3_asr_config`）のスタブを解決する。

## Background

RFC §10 の設計では、`SttEngine::Local(Qwen3Asr)` 時に `qwen3_asr_config` が必須であることを `build()` で検証する。既存の OpenAI 設定チェックと同一パターンで実装する。

## Scope

### 実施すること

- `config.rs` の `build()` に `SttEngine::Local` 時の分岐追加:
  - `qwen3_asr_config` が `None` → エラーメッセージ
  - `Some(...)` → `Ok(())`
- `recognizer.rs` の `resolve_qwen3_model_paths` / `resolve_qwen3_asr_config` から `#[allow(dead_code)]` を除去（本バリデーションで初めて使用）
- `cargo check` 0 errors / 0 warnings

### 実施しないこと

- `SpeechRecognizer::validate_config()` の変更（M6-1 で完了）
- build.rs の変更（M7-1）

## Investigation

### 現在の build() バリデーション

`config.rs` L160-164:
```rust
if engine == SttEngine::OpenAI && self.openai_config.is_none() {
    return Err(VoiputError::InvalidConfig(
        "openai_config is required when engine is OpenAI".into(),
    ));
}
```

これを Local の場合も同様に拡張する。

### スタブ解決（2 件）

| スタブ | ファイル | 現状 |
|--------|---------|------|
| `#[allow(dead_code)] resolve_qwen3_model_paths` | recognizer.rs | バリデーションで使用 |
| `#[allow(dead_code)] resolve_qwen3_asr_config` | recognizer.rs | バリデーションで使用 |

### 依存チケット

- M6-1 (#116): ✅ reviewed
- M6-3: 後続（最終確認）

## Test Plan

1. `SttEngine::Local(Qwen3Asr)` + `qwen3_asr_config = None` → `Err`
2. `SttEngine::Local(Qwen3Asr)` + `qwen3_asr_config = Some(...)` → `Ok`

## Boy Scout Rule — 翻訳可能性計画

`#[allow(dead_code)]` 2 件を除去しコードベースの正確性を向上。

## Acceptance Criteria

- [ ] `build()` に `SttEngine::Local` 時のバリデーションが追加されていること
- [ ] エラーメッセージが日本語であること
- [ ] `#[allow(dead_code)]` 2 件が除去されていること
- [ ] `cargo check` が 0 errors / 0 warnings で成功すること

## Notes

### 依存関係

- **先行実装必須**: M6-1 (#116) ✅ reviewed
- **本チケットで M6 マイルストーン完了**

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M6-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§10)

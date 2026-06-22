---
ticket_id: 141
title: M2-1: InferenceEngine トレイト定義 (inference/mod.rs)
slug: m2-1-inferenceengine-inferencemodrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0141-m2-1-inferenceengine-inferencemodrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0141-m2-1-inferenceengine-inferencemodrs/review.md
---

# M2-1: InferenceEngine トレイト定義 (inference/mod.rs)

## Summary

`InferenceEngine` トレイト（4メソッド）と `GenerateParams` 構造体を `inference/mod.rs` に定義する。`#[async_trait]` を使用し、`Send + Sync` をスーパートレイトとして要求する。

## Background

ggufrs の最も重要な抽象化。このトレイトが crate の公開APIの中核となる。4メソッドのうち3つが高レベルAPI、1つが低レベルAPIという設計により、使いやすさと拡張性を両立する。

依存関係: M0-2（定数）、M0-3（GpuProvider）、M0-4（GgufError）、M1-5（ModelRegistry 型）— 全て reviewed ✅

## Scope

- `GenerateParams` 構造体: temperature/max_tokens/top_p/presence_penalty/frequency_penalty の Option フィールド + Default impl（DEFAULT_TEMPERATURE 等を参照）
- `InferenceEngine` トレイト: `Send + Sync` スーパートレイト、`#[async_trait]`
  - `generate(&self, model_name, prompt, params) -> Result<String, GgufError>`
  - `generate_structured(&self, model_name, prompt, params, schema) -> Result<Value, GgufError>`
  - `generate_stream(&self, model_name, prompt, params) -> Result<Pin<Box<...>>, GgufError>`
  - `send_raw(&self, model_name, request) -> Result<Response, GgufError>`
- lib.rs に `pub mod inference;` + `pub use` 追加

## Non-scope

- トレイト実装（mistralrs バックエンド）→ M3-2/M3-3/M3-4
- mockall ベーステスト → M2-4

## Investigation

### 証拠 1: inference/mod.rs の現状

STUB コメントのみ:
```rust
//! # [::STUB::] M2-1 でトレイト定義を実装
//! # [::STUB::] M3-2, M3-3, M3-4 で各メソッドの実装を追加
```

### 証拠 2: 依存関係の充足

M0-2/M0-3/M0-4/M1-5 全て reviewed ✅。GenerateParams の Default で `DEFAULT_TEMPERATURE` 等の定数を使用可能。

### 証拠 3: トレイト設計

```rust
#[async_trait]
pub trait InferenceEngine: Send + Sync {
    async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String, GgufError>;
    async fn generate_structured(&self, model_name: &str, prompt: &str, params: GenerateParams, schema: Value) -> Result<Value, GgufError>;
    async fn generate_stream(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError>;
    async fn send_raw(&self, model_name: &str, request: RequestBuilder) -> Result<Response, GgufError>;
}
```

### 証拠 4: async-trait 依存確認

M0-1 で Cargo.toml に `async-trait = "0.1"` を追加済み。

## Test Plan

### ユニットテスト計画

**テスト対象**: `inference/mod.rs` の `InferenceEngine` トレイト + `GenerateParams`

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `inference_engine_is_send_sync` | 正常系 | Send + Sync コンパイル時チェック |
| `inference_engine_is_object_safe` | 正常系 | `dyn InferenceEngine` として使用可能 |
| `generate_params_default_uses_constants` | 正常系 | Default 値が定数と一致 |

**カバレッジ目標**: 100%（トレイト定義＋Default impl）

### ユニットテスト不可能な項目（例外）

- 実際の推論処理は mistralrs バックエンドが必要 → M3-2 以降

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（inference/mod.rs）

- トレイトメソッド名は全て動詞句: `generate`, `generate_structured`, `generate_stream`, `send_raw`
- `GenerateParams` フィールド名は推論パラメータのドメイン概念を正確に表現

## Acceptance Criteria

- [ ] `InferenceEngine` トレイトが4メソッドで定義されている（`#[async_trait]` + `Send + Sync`）
- [ ] `GenerateParams` 構造体が5フィールド + `impl Default` で定義されている
- [ ] `GenerateParams` の Default が `crate::consts` の定数を参照している
- [ ] トレイトがオブジェクトセーフである
- [ ] `lib.rs` に `pub mod inference;` + `pub use` が既存/新規で含まれている
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-2 (#131) | 先行 — DEFAULT_TEMPERATURE 等（reviewed ✅） |
| M0-3 (#132) | 先行 — GpuProvider（reviewed ✅） |
| M0-4 (#133) | 先行 — GgufError（reviewed ✅） |
| M1-5 (#140) | 先行 — ModelRegistry（reviewed ✅） |
| M2-4 (未) | 後続 — mockall テスト |
| M3-2〜M3-4 (未) | 後続 — 実装 |

### STUB 解決

本チケットは `inference/mod.rs` の `[::STUB::] M2-1` を解決する。

### 成果物

- 計画: context/0141-m2-1-inferenceengine-inferencemodrs/plan.md（未作成）
- 実装サマリ: context/0141-m2-1-inferenceengine-inferencemodrs/implementation.md（未作成）
- レビュー報告書: context/0141-m2-1-inferenceengine-inferencemodrs/review.md（未作成）

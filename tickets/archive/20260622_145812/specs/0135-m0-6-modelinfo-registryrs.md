---
ticket_id: 135
title: M0-6: ModelInfo 構造体定義 (registry.rs)
slug: m0-6-modelinfo-registryrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0135-m0-6-modelinfo-registryrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0135-m0-6-modelinfo-registryrs/review.md
---

# M0-6: ModelInfo 構造体定義 (registry.rs)

## Summary

「設定（ModelConfig）」と「実行時状態（ModelInfo）」の2層分離を実現する `ModelInfo` 構造体を `registry.rs` に定義する。`ModelConfig` の全フィールドを内包し、加えて `model: Option<Arc<Model>>` を保持する。

## Background

M0-5 で定義した `ModelConfig` は静的な設定値のみを保持する。実行時にはモデルインスタンス（`Arc<Model>`）を関連付ける必要がある。`ModelInfo` はこの「設定＋実行時状態」の組み合わせを表現し、`ModelRegistry` 内部でのみ生成・保持される。

依存関係: M0-5（ModelConfig）reviewed ✅

## Scope

- `registry.rs` に `ModelInfo` 構造体を定義:
  - `name: String`, `model_path: PathBuf`, `lazy_load: bool`
  - `context_size: Option<u32>`, `gpu_layers: Option<u32>`, `batch_size: Option<u32>`, `chat_template: Option<String>`
  - `model: Option<Arc<Model>>`（`pub(crate)`）
- `impl From<ModelConfig> for ModelInfo`
- 全フィールドに日本語コメント

## Non-scope

- `ModelRegistry` 構造体 → M1-5
- 同期メソッド（`add`, `get`, `remove`, `list`） → M1-5
- 非同期メソッド → M2-2

## Investigation

### 証拠 1: registry.rs の現状

`registry.rs` はモジュールレベルのドキュメントコメントと STUB コメントのみ:

```rust
//! # [::STUB::] M0-6 で ModelInfo 構造体を実装
//! # [::STUB::] M1-5 で同期メソッドを実装
//! # [::STUB::] M2-2 で非同期メソッドを実装
```

**ソース**: `src/registry.rs` の直接読み取り

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-5 (#134) | reviewed ✅ | `ModelConfig` → `From<ModelConfig>` で使用 |

### 証拠 3: 使用する型の確認

- `mistralrs::Model` — mistralrs のモデルインスタンス型。`pub use mistralrs_core::model::Model` として再公開済み
- `std::sync::Arc` — スレッドセーフな共有参照
- `std::path::PathBuf` — ファイルパス表現

## Test Plan

### ユニットテスト計画

**テスト対象**: `registry.rs` の `ModelInfo` + `From<ModelConfig>`

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `model_info_from_model_config_copies_all_fields` | 正常系 | ModelConfig から変換後、全7フィールドが一致 |
| `model_info_model_field_is_none_after_from` | 正常系 | 変換直後は `model` が `None` |
| `model_info_model_field_settable` | 正常系 | `model` フィールドに値をセット可能（pub(crate)経由） |

**カバレッジ目標**: 100%
**モック/スタブ**: 不要（純粋な型変換）

### ユニットテスト不可能な項目（例外）

なし。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（registry.rs）

- フィールド名は ModelConfig と一貫性を保つ（`name`, `model_path` 等）
- `From<ModelConfig>` 実装により変換ロジックを一箇所に集約
- 各フィールドに「なぜ存在するか」を日本語コメントで記述
- `model` フィールドは `pub(crate)` により外部からの直接操作を制限

### スコープ外の改善

既存コードは STUB のみのため改善対象なし。

## Acceptance Criteria

- [ ] `ModelInfo` 構造体が ModelConfig の全7フィールド + `model: Option<Arc<Model>>` で定義されている
- [ ] `impl From<ModelConfig> for ModelInfo` が実装されている
- [ ] `model` フィールドが `pub(crate)` で外部からの直接操作が制限されている
- [ ] 全フィールドに日本語コメントが記述されている
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-1 (#130) | crate骨格（reviewed ✅） |
| M0-5 (#134) | 先行実装必須 — `ModelConfig` からの変換（reviewed ✅） |
| M1-5 (未作成) | 後続 — `ModelRegistry` 同期メソッド |
| M2-2 (未作成) | 後続 — 非同期メソッド |

### STUB 解決

本チケットは `registry.rs` の `[::STUB::] M0-6 で ModelInfo 構造体を実装` を解決する。

### 成果物

- 計画: context/0135-m0-6-modelinfo-registryrs/plan.md（未作成）
- 実装サマリ: context/0135-m0-6-modelinfo-registryrs/implementation.md（未作成）
- レビュー報告書: context/0135-m0-6-modelinfo-registryrs/review.md（未作成）

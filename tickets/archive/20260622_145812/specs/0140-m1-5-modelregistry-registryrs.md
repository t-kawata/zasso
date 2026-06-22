---
ticket_id: 140
title: M1-5: ModelRegistry 同期メソッド (registry.rs)
slug: m1-5-modelregistry-registryrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0140-m1-5-modelregistry-registryrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0140-m1-5-modelregistry-registryrs/review.md
---

# M1-5: ModelRegistry 同期メソッド (registry.rs)

## Summary

`ModelRegistry` 構造体を定義し、同期 API（`new()`, `from_config()`, `add_model()`, `list_models()`）を実装する。内部で `RwLock<Vec<ModelInfo>>` を使用しスレッドセーフを確保する。

## Background

ModelRegistry の同期 API を先行実装し、非同期メソッド（モデルロード等）は M2-2 で追加する。分割により同期部分の単体テストを早期に行える。

依存関係: M0-6（ModelInfo）reviewed ✅

## Scope

- `ModelRegistry` 構造体: `models: RwLock<Vec<ModelInfo>>`
- `ModelRegistry::new()` — 空のレジストリ
- `ModelRegistry::from_config(models: Vec<ModelConfig>)` — ModelConfig 一括変換
- `ModelRegistry::add_model(&self, config: ModelConfig)` — 単一モデル追加（RwLock write）
- `ModelRegistry::list_models(&self) -> Vec<String>` — 登録済みモデル名一覧（RwLock read）

## Non-scope

- 非同期メソッド（load_model / unload_model）→ M2-2
- モデルインスタンス（Arc<Model>）の設定 → M2-2
- 重複排除ロジック（本仕様では同名モデルをそのまま追加）

## Investigation

### 証拠 1: registry.rs の現状

`ModelInfo` 構造体 + `From<ModelConfig>` + `Debug` 手動実装 + テスト3件は M0-6 で実装済み。`ModelRegistry` は未実装で、STUB が残っている:

```rust
//! # [::STUB::] M1-5 で同期メソッド（add / get / remove / list）を実装
```

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-6 (#135) | reviewed ✅ | ModelInfo + From<ModelConfig> |

## Test Plan

### ユニットテスト計画

**テスト対象**: `registry.rs` の `ModelRegistry`

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `new_creates_empty_registry` | 正常系 | `list_models()` が空の Vec |
| `add_model_then_list_contains_name` | 正常系 | `add_model()` → `list_models()` に含まれる |
| `from_config_with_multiple_models` | 正常系 | 複数モデルを `from_config` して件数一致 |
| `add_model_duplicate_name_keeps_both` | 正常系 | 同名モデルを2回追加で2件 |
| `list_models_is_sorted` | 正常系 | 追加順に保持される |

**カバレッジ目標**: 100%
**モック/スタブ**: 不要

### ユニットテスト不可能な項目（例外）

なし。同期メソッドはすべて純粋なデータ操作。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（registry.rs ModelRegistry）

- `new()` — 「新しいレジストリを作成する」
- `from_config()` — 「設定からレジストリを構築する」
- `add_model()` — 「モデルを追加する」
- `list_models()` — 「モデル一覧を取得する」
- 全メソッド名が動詞句で「何をするか」を明確に表現

## Acceptance Criteria

- [ ] `ModelRegistry` 構造体が `RwLock<Vec<ModelInfo>>` で定義されている
- [ ] `new()` が空のレジストリを生成する
- [ ] `from_config()` が与えられた ModelConfig の数だけ ModelInfo を持つ
- [ ] `add_model()` がスレッドセーフにモデルを追加する（RwLock使用）
- [ ] `list_models()` が登録済みモデル名一覧を返す
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-6 (#135) | 先行実装必須 — ModelInfo + From<ModelConfig>（reviewed ✅） |
| M2-2 (未作成) | 後続 — 非同期メソッド追加 |

### STUB 解決

本チケットは `registry.rs` の `[::STUB::] M1-5` を解決する。

### 成果物

- 計画: context/0140-m1-5-modelregistry-registryrs/plan.md（未作成）
- 実装サマリ: context/0140-m1-5-modelregistry-registryrs/implementation.md（未作成）
- レビュー報告書: context/0140-m1-5-modelregistry-registryrs/review.md（未作成）

---
ticket_id: 142
title: M2-2: ModelRegistry 非同期メソッド (registry.rs)
slug: m2-2-modelregistry-registryrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0142-m2-2-modelregistry-registryrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0142-m2-2-modelregistry-registryrs/review.md
---

# M2-2: ModelRegistry 非同期メソッド (registry.rs)

## Summary

`ModelRegistry` に非同期メソッド `get()`, `load_immediate()`, `load_all()` を追加する。実際のモデルロードは M3-2 で実装し、この段階ではロック戦略と async インターフェースの定義が主目的。

## Background

モデルの遅延ロード機構の非同期ラッパーを先に実装し、実際の GgufModelBuilder 呼び出しは M3-2 で実装する。これにより ModelRegistry のロック戦略と async インターフェースを早期に確定できる。

依存関係: M1-5（ModelRegistry + 同期メソッド）reviewed ✅

## Scope

- `ModelRegistry::get(&self, name: &str) -> Result<Arc<Model>, GgufError>` — 遅延ロード（未ロード時のみ）
- `ModelRegistry::load_immediate(&self) -> Result<(), GgufError>` — lazy_load=false のみロード
- `ModelRegistry::load_all(&self) -> Result<(), GgufError>` — 全モデル強制ロード
- 未登録モデル名 → `GgufError::ModelNotFound`
- モデルロード実装は `[::STUB::]`（M3-2 で GgufModelBuilder を使用）

## Non-scope

- 実際の GgufModelBuilder 呼び出し → M3-2

## Investigation

### 証拠 1: registry.rs の現状

ModelRegistry は M1-5 で同期メソッド（new/from_config/add_model/list_models）のみ実装済み。`#[async_trait]` は不要（トレイト定義ではなく impl ブロックに async fn を直接追加）。

```rust
//! # [::STUB::] M2-2 で非同期メソッド（load_model / unload_model）を実装
```

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M1-5 (#140) | reviewed ✅ | ModelRegistry 構造体 + RwLock<Vec<ModelInfo>> |

### 証拠 3: ロック戦略

- `get()`: ① 読み取りロックで model チェック（Some→即返却）、② None の場合 書き込みロックにアップグレードしてロード
- `load_immediate()`: 書き込みロックで lazy_load=false のモデルのみロード
- `load_all()`: 書き込みロックで全モデルロード
- 実際のロード処理は `[::STUB::] Err(ModelLoadFailed)` を返す（M3-2 で実装）

## Test Plan

### ユニットテスト計画

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `get_unregistered_model_returns_not_found` | 異常系 | 未登録名→ModelNotFound |
| `get_unloaded_model_returns_stub_error` | 正常系 | 未ロード→STUBエラー（M3-2未実装） |
| `load_immediate_skips_lazy_models` | 正常系 | lazy_load=true はスキップ |

**カバレッジ目標**: 90%（実際のロード処理以外はカバー）
**例外**: 本番モデルロード（GgufModelBuilder）は M3-2 でテスト

## Boy Scout Rule — 翻訳可能性計画

メソッド名は動詞句: `get`, `load_immediate`, `load_all`

## Acceptance Criteria

- [ ] `get(&self, name)` が未登録モデルに `ModelNotFound` を返す
- [ ] `load_immediate()` が lazy_load=false のモデルのみ処理する
- [ ] `load_all()` が全モデルを対象とする
- [ ] ロード実装が `[::STUB::]` でマークされている
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する

## Notes

依存関係: M1-5 (#140) reviewed ✅。後続: M2-3（GgufEngine::new）、M3-2（実モデルロード）。
STUB解決: registry.rs の M2-2 STUB。（M1-5 は既に解決済み）

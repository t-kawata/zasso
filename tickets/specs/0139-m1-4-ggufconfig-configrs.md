---
ticket_id: 139
title: M1-4: GgufConfig マージロジック (config.rs)
slug: m1-4-ggufconfig-configrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0139-m1-4-ggufconfig-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0139-m1-4-ggufconfig-configrs/review.md
---

# M1-4: GgufConfig マージロジック (config.rs)

## Summary

`GgufConfig` に `from_code()` コンストラクタと `merge_overlay()` メソッドを実装する。3層マージの核となる同期的なマージロジックを独立して実装・テスト可能にする。

## Background

3層マージ（コード → JSON文字列 → ファイル）の核となるロジック。この段階では同期的なマージのみを実装し、ファイル読み取りや JSON パースは M3-1 で追加する。これによりマージロジックを早期に単独テストできる。

依存関係: M0-5（GgufConfig / ServerConfig / GpuConfig / ModelConfig）reviewed ✅

## Scope

- `GgufConfig::from_code(models: Vec<ModelConfig>) -> Self`
  - `ServerConfig::default()` + `GpuConfig::default()` + 指定モデルで GgufConfig 生成
- `GgufConfig::merge_overlay(&mut self, overlay: GgufConfig)` — `pub(crate)`
  - models: name ベースマージ（同名上書き、新規追加）
  - server: `bind.port() != 0` の場合のみ上書き
  - gpu: `provider != Auto` の場合のみ上書き

## Non-scope

- ファイルI/O（ConfigLayer::File の読み取り）→ M3-1
- JSON パース（ConfigLayer::JsonStr）→ M3-1
- `ConfigLayer` からの変換ロジック → M3-1

## Investigation

### 証拠 1: config.rs の現状

`GgufConfig` / `ServerConfig` / `GpuConfig` / `ModelConfig` / `ConfigLayer` は M0-5 で定義済み。関連メソッドは未実装。

config.rs に STUB が残っている:
```rust
//! # [::STUB::] M1-1, M1-2, M1-4 でメソッド・マージロジックを実装
```

本チケットで M1-4 部分を解決する。

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-5 (#134) | reviewed ✅ | GgufConfig / ServerConfig / GpuConfig / ModelConfig |

## Test Plan

### ユニットテスト計画

**テスト対象**: `config.rs` の `GgufConfig` メソッド

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `from_code_uses_default_server_and_gpu` | 正常系 | server/gpu が Default 値 |
| `from_code_contains_given_models` | 正常系 | 指定したモデルが含まれる |
| `merge_overlay_same_name_model_overwrites` | 正常系 | 同名モデルは後続で上書き |
| `merge_overlay_diff_name_model_appends` | 正常系 | 異名モデルは両方保持 |
| `merge_overlay_server_only_when_port_nonzero` | 正常系 | port=0 の場合は上書きしない |
| `merge_overlay_gpu_only_when_provider_not_auto` | 正常系 | Auto の場合は上書きしない |
| `merge_overlay_empty_overlay_no_change` | 正常系 | 空の overlay で変化なし |
| `merge_overlay_partial_models_only` | 正常系 | models のみの overlay |

**カバレッジ目標**: 100%
**モック/スタブ**: 不要

### ユニットテスト不可能な項目（例外）

なし。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（config.rs GgufConfig impl）

- `from_code()` — 「コードから GgufConfig を生成する」と読める
- `merge_overlay()` — 「overlay を自身にマージする」と読める
- 条件付きマージの意図を日本語コメントで説明（port=0, provider=Auto のスキップ理由）

## Acceptance Criteria

- [ ] `GgufConfig::from_code(models)` が `ServerConfig::default()` + `GpuConfig::default()` + 指定モデルで正しく生成される
- [ ] `GgufConfig::merge_overlay()` が `pub(crate)` で実装されている
- [ ] merge_overlay の models マージが name ベースで正しく動作する
- [ ] merge_overlay の server/gpu 条件付き上書きが正しく動作する
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-5 (#134) | 先行実装必須 — GgufConfig 他構造体（reviewed ✅） |
| M3-1 (未作成) | 後続 — ファイルI/O + build 完全実装 |

### STUB 解決

本チケットは config.rs の M1-4 STUB 部分を解決する（M1-1, M1-2 は既に解決済み）。

### 成果物

- 計画: context/0139-m1-4-ggufconfig-configrs/plan.md（未作成）
- 実装サマリ: context/0139-m1-4-ggufconfig-configrs/implementation.md（未作成）
- レビュー報告書: context/0139-m1-4-ggufconfig-configrs/review.md（未作成）

---
ticket_id: 133
title: M0-4: GgufError 列挙型 (error.rs)
slug: m0-4-gguferror-errorrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0133-m0-4-gguferror-errorrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0133-m0-4-gguferror-errorrs/review.md
---

# M0-4: GgufError 列挙型 (error.rs)

## Summary

GGUF 推論エンジン全体で使用する統一エラー型 `GgufError` を `error.rs` に定義する。6バリアントで構成し、`thiserror` クレートを使用して `std::error::Error` トレイトを実装する。

## Background

crate 内の全エラーを単一の列挙型に集約し、`?` 演算子による透過的なエラー伝搬を可能にする。`thiserror` の `#[from]` 属性により `mistralrs::Error` からの自動変換を提供する。

依存関係: M0-1（crate 骨格）reviewed ✅。（M0-2, M0-3 とは独立して並行実装可能）

## Scope

- `error.rs` に `GgufError` 列挙型（6バリアント）を定義:
  - `ModelNotFound(String)` — モデル名
  - `ModelLoadFailed { name: String, source: Box<dyn std::error::Error + Send + Sync> }`
  - `InferenceFailed(Box<dyn std::error::Error + Send + Sync>)`
  - `ServerStartupFailed(Box<dyn std::error::Error + Send + Sync>)`
  - `InvalidConfig(String)`
  - `MistralrsError(#[from] mistralrs::Error)`
- `#[derive(Debug, thiserror::Error)]` を使用
- 各バリアントに `#[error("...")]` 属性で日本語エラーメッセージを記述

## Non-scope

- `From` トレイトの手動実装（`mistralrs::Error` 以外の外部エラー型からの変換）→ M1-3
- その他のエラー型の追加
- エラーハンドリングロジック

## Investigation

### 証拠 1: error.rs の現状

`error.rs` はモジュールレベルのドキュメントコメントと STUB コメントのみ：

```rust
//! GgufError エラー型
//!
//! [::STUB::] M0-4 で GgufError 列挙型を実装
```

**ソース**: `src/error.rs` 1-3行目の直接読み取り

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-1 (#130) | reviewed ✅ | 先行実装必須 — crate 骨格（Cargo.toml の thiserror 依存） |

### 証拠 3: thiserror の依存確認

`Cargo.toml` に `thiserror = "2"` が既に含まれている。

```toml
thiserror = "2"
```

**ソース**: `Cargo.toml` の直接読み取り

### 証拠 4: mistralrs::Error の型確認

`GgufError::MistralrsError` は `#[from]` 属性により `mistralrs::Error` からの自動変換を提供する。これにより全 mistralrs 操作のエラーが `?` 演算子で自動的に `GgufError` に変換される。

## Test Plan

### ユニットテスト計画

**テスト対象**: `error.rs` の `GgufError` 列挙型

| テストケース | 分類 | 検証内容 |
|-------------|------|---------|
| `gguf_error_implements_std_error` | 正常系 | `GgufError` が `std::error::Error` トレイトを実装している |
| `gguf_error_is_send_sync` | 正常系 | `GgufError` が `Send + Sync` を満たす（コンパイル時チェック） |
| `gguf_error_display_model_not_found` | 正常系 | `ModelNotFound` の Display がモデル名を含む |
| `gguf_error_display_model_load_failed` | 正常系 | `ModelLoadFailed` の Display がモデル名を含む |
| `gguf_error_display_inference_failed` | 正常系 | `InferenceFailed` の Display がエラー内容を含む |
| `gguf_error_display_server_startup_failed` | 正常系 | `ServerStartupFailed` の Display がエラー内容を含む |
| `gguf_error_display_invalid_config` | 正常系 | `InvalidConfig` の Display が設定内容を含む |
| `gguf_error_display_mistralrs_error` | 正常系 | `MistralrsError` の Display が元エラーメッセージを含む |
| `gguf_error_source_for_wrapped_error` | 正常系 | 内部エラーを持つバリアントで `source()` が `Some` を返す |
| `gguf_error_source_for_string_error` | 正常系 | 文字列のみのバリアントで `source()` が `None` を返す |
| `gguf_error_debug_output` | 正常系 | `Debug` 出力が各フィールドの情報を含む |

**カバレッジ目標**: 100%（純粋な型定義 + thiserror derive）
**モック/スタブ**: 不要

### ユニットテスト不可能な項目（例外）

なし。全テストケースが純粋な型の検証であり実機不要。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（error.rs）

- バリアント名は全て動詞句またはドメイン概念を名詞化（`ModelNotFound`, `InferenceFailed` 等） — 「モデルが見つからない」「推論に失敗した」と日本語に直訳可能
- `#[error("...")]` メッセージは日本語で記述し、エラー内容を即座に理解可能にする
- エラーの握りつぶしは禁止 — 全バリアントがエラー情報を保持する設計

### スコープ外の改善

`error.rs` の既存コードは STUB のみで改善対象なし。

## Acceptance Criteria

- [ ] `GgufError` 列挙型が6バリアントで定義されている
- [ ] `#[derive(Debug, thiserror::Error)]` が付与されている
- [ ] 各バリアントに `#[error("...")]` で日本語エラーメッセージが記述されている
- [ ] `MistralrsError` が `#[from]` で `mistralrs::Error` からの自動変換を提供する
- [ ] 内部エラーを持つバリアントが `Box<dyn std::error::Error + Send + Sync>` を使用している
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する（Error トレイト実装、Display、Send + Sync 含む）

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-1 (#130) | 先行実装必須（reviewed ✅） |
| M1-3 (未作成) | 後続 — From impls 追加 |
| 全実装チケット | 本チケットのエラー型をエラー伝搬に使用 |

### STUB 解決

本チケットは `error.rs` の STUB 1件を解決する。

### 成果物

- 計画: context/0133-m0-4-gguferror-errorrs/plan.md（未作成）
- 実装サマリ: context/0133-m0-4-gguferror-errorrs/implementation.md（未作成）
- レビュー報告書: context/0133-m0-4-gguferror-errorrs/review.md（未作成）

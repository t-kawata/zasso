---
ticket_id: 9
title: M0-2: エラー型の定義（RegistryError with thiserror + anyhow）
slug: m0-2-registryerror-with-thiserror-anyhow
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0009-m0-2-registryerror-with-thiserror-anyhow/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0009-m0-2-registryerror-with-thiserror-anyhow/review.md
---
# M0-2: エラー型の定義（RegistryError with thiserror + anyhow）

## Summary

`process-registry` クレート全体で使用するエラー型 `RegistryError` を定義する。`thiserror` による `std::error::Error` の自動 derive、`Display` のフォーマット文字列まで含めて確定させる。後続の全チケット（M2-1 以降）がこのエラー型を返す。

## Background

プロセスレジストリの操作（起動・停止・監視・依存解決）には複数のエラー要因が存在する：不明な依存関係、循環依存、プロセス未検出、spawn 失敗、タイムアウト。これらを統一的に扱うため、`thiserror` を用いた型安全なエラー型 `RegistryError` を定義する。`SpawnFailed` は `anyhow::Error` を内包し、OS エラーやコマンド不存在など任意のエラー原因をラップできる。

**参照設計書:** docs/RFC-001-process-registry.md (§6)

## Scope

- `crates/procreg/Cargo.toml` に `thiserror` と `anyhow` を依存として追加（`cargo add` 使用）
- `crates/procreg/src/error.rs` の新規作成（以下のエラー型を定義）
  - `RegistryError` 列挙型 — `#[derive(Debug, thiserror::Error)]`
    - `UnknownDependency { src: String, dep: String }` — `#[error("...")]`
    - `CircularDependency` — `#[error("...")]`
    - `NotFound(String)` — `#[error("...")]`
    - `SpawnFailed { name: String, source: anyhow::Error }` — `#[error("...")]`
    - `ReadyTimeout { name: String, timeout: Duration }` — `#[error("...")]`
- `crates/procreg/src/lib.rs` に以下の変更:
  - `mod error;` 宣言の追加
  - `pub use crate::error::RegistryError;` の追加
  - crate レベルの doc コメントにエラー型の記載を追加
- ユニットテスト（`error.rs` 内の `#[cfg(test)] mod tests`）

## Non-scope

- `RegistryError` を返す関数の実装（M2-1: `resolve_start_order`、M8-1: `spawn_one` 等のスコープ）
- `petgraph` 等の追加依存（後続チケットで導入）

## Investigation

### コードベース調査結果

```
crates/procreg/
  ├── Cargo.toml          # package 定義のみ、依存なし
  ├── Tickets.md          # 全体設計書
  └── src/
      └── lib.rs          # M0-1 で定義された4型 + 13テスト（411行）
```

- **発見1**: `Cargo.toml` に依存クレートは未追加。`cargo add thiserror && cargo add anyhow` で追加する。
- **発見2**: `lib.rs` は M0-1 の型を直接定義している（モジュール分割なし）。M0-2 からは `error.rs` として独立モジュール化するのが適切。
- **発見3**: Rust コーディング規約（`rules/rust/coding-style.md`）により、「ライブラリは `thiserror` で型付きエラーを定義」「アプリケーションは `anyhow`」の原則に従う。本クレートはライブラリのため `RegistryError` は `thiserror` で定義し、`anyhow::Error` は `SpawnFailed` の内包のみで使用。
- **発見4**: `cargo add` はプロジェクトルートからの実行を想定しているが、本クレートは `src-tauri` のワークスペース外の独立 crate。`cd crates/procreg && cargo add thiserror && cargo add anyhow` で追加する。

### RFC §6 のエラー型定義

```rust
#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("Unknown dependency '{dep}' referenced by '{src}'")]
    UnknownDependency { src: String, dep: String },

    #[error("Circular dependency detected in process definitions")]
    CircularDependency,

    #[error("Process '{0}' not found in registry")]
    NotFound(String),

    #[error("Spawn failed for '{name}': {source}")]
    SpawnFailed { name: String, source: anyhow::Error },

    #[error("ReadyCondition timed out for '{name}' after {timeout:?}")]
    ReadyTimeout { name: String, timeout: std::time::Duration },
}
```

### 設計上の制約

- `SpawnFailed` は `anyhow::Error` を内包するため、`Error::source()` が `Some(&source)` を返すことをテストで確認する
- `NotFound(String)` はタプルバリアント（`#[error("Process '{0}' ...")]`）
- それ以外は名前付きバリアント（表示フォーマット `{src}`, `{dep}`, `{name}`, `{source}`, `{timeout}`）

## Test Plan

### ユニットテスト計画

全テストは `src/error.rs` 内の `#[cfg(test)] mod tests` に記述する。外部依存は `thiserror` + `anyhow` のみで、全テストがメモリ内完結・決定論的。

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `unknown_dependency_display` | 正常系 | `UnknownDependency { src: "A", dep: "B" }` の Display が期待文字列と一致すること |
| 2 | `circular_dependency_display` | 正常系 | `CircularDependency` の Display が期待文字列と一致すること |
| 3 | `not_found_display` | 正常系 | `NotFound("myapp".into())` の Display が期待文字列と一致すること |
| 4 | `spawn_failed_display` | 正常系 | `SpawnFailed { name: "foo", source: anyhow::Error::msg("command not found") }` の Display にエラー内容が含まれること |
| 5 | `spawn_failed_source` | 特性確認 | `SpawnFailed` の `.source()` が `Some(...)` を返し、内部の `anyhow::Error` と一致すること |
| 6 | `ready_timeout_display` | 正常系 | `ReadyTimeout { name: "bar", timeout: Duration::from_secs(5) }` の Display が `"ReadyCondition timed out for 'bar' after 5s"` にマッチすること |
| 7 | `error_trait_impl` | 特性確認 | `RegistryError` が `std::error::Error` トレイトを実装していること（`fn source(&self)` がコンパイルエラーなく呼べること） |
| 8 | `not_found_source_is_none` | 境界系 | `NotFound` の `.source()` が `None` を返すこと（内包エラーなし） |
| 9 | `debug_format` | 特性確認 | `RegistryError` が `Debug` トレイトを実装しており、`"{:?}"` でフォーマット可能であること |

**カバレッジ目標:** 全5バリアントの Display 確認 + `source()` 網羅。100%。

### ユニットテスト不可能な項目（例外）

なし。本チケットの全実装はメモリ内完結。

## Boy Scout Rule — 翻訳可能性計画

本チケットは主に新規ファイル（`error.rs`）の作成だが、`lib.rs` にも変更を加える。以下の点を遵守する：

1. **エラーバリアント名はドメインの事象を名詞句で表現**: `UnknownDependency`, `CircularDependency`, `NotFound`, `SpawnFailed`, `ReadyTimeout` — いずれも「何が起きたか」を一文で表す
2. **エラーメッセージはテンプレートとして散文**: `#[error("...")]` は「何が」「なぜ」「どのコンテキストで」を英語で完結に記述。ログ用途のため英語とする（CLAUDE.md の言語プロトコルに準拠：実行ログは英語）
3. **`lib.rs` の変更は最小差分**: `mod error;` + `pub use` のみ追加。既存の型定義やテスト構造には一切変更を加えない（surgical diff）
4. **コメントは「なぜ」を説明**: `SpawnFailed` の `anyhow::Error` 内包理由（OSエラーやコマンド不存在など任意のエラー原因をラップするため）を doc コメントで説明

## Acceptance Criteria

- [ ] `cargo add thiserror && cargo add anyhow` が成功し、`Cargo.toml` に依存が追加される
- [ ] `RegistryError` が RFC §6 通りの5バリアントを持つ
- [ ] 各バリアントに `#[error("...")]` フォーマット文字列が設定されている
- [ ] `SpawnFailed` が `anyhow::Error` を `source` フィールドとして持つ
- [ ] `src/error.rs` が新規作成され、`lib.rs` から `mod error;` + `pub use` で再公開される
- [ ] 全9テストケースが通過する
- [ ] `cargo check` が警告なく通過する
- [ ] 既存の M0-1 テスト（13件）が引き続き通過する

## Notes

### 依存関係グラフ内の位置づけ

```
M0-1 (純粋データ型) ──独立── M0-2 (RegistryError)
                                    │
                              M0-3 (ProcessState) ── 後続全チケットから参照
```

- M0-2 は M0-1 の4型に依存しない（独立して実装・テスト可能）
- M2-1（`resolve_start_order`）は `RegistryError::UnknownDependency` と `CircularDependency` を返す
- M5-1（`wait_ready`）は `RegistryError::ReadyTimeout` を返す
- M8-1（`spawn_one`）は `RegistryError::SpawnFailed` と `NotFound` を返す

### 成果物

- 計画: context/0009-m0-2-registryerror-with-thiserror-anyhow/plan.md（未作成）
- 実装サマリ: context/0009-m0-2-registryerror-with-thiserror-anyhow/implementation.md（未作成）
- レビュー報告書: context/0009-m0-2-registryerror-with-thiserror-anyhow/review.md（未作成）

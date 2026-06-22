---
ticket_id: 161
title: "M2-3: ConfigLoader — TOML 読込 + CLI"
slug: m2-3-configloader-toml-cli
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0161-m2-3-configloader-toml-cli/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0161-m2-3-configloader-toml-cli/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0161-m2-3-configloader-toml-cli/review.md
---

# M2-3: ConfigLoader — TOML 読込 + CLI

## Summary

ファイル I/O を含む最初のチケット。`AppConfig::from_toml()` で TOML ファイルを読み込み・パース・検証し、`cli.rs` で `clap` ベースの CLI 引数解析を実装する。本チケットにより、`anthropx` は設定ファイルからの起動が可能になる。

**参照設計書:** `crates/anthropx/RFC.md` (§2 設定システム, Appendix A)

## Background

`anthropx` は TOML 設定ファイルとプログラム的構築の二刀流をサポートする（RFC §2）。本チケットではファイル I/O パスを完成させる:

1. `AppConfig::from_toml(path)` — `std::fs::read_to_string` → `toml::from_str` → `self.validate()`
2. `cli::parse_args()` — `clap` で `-t <config.toml>` 必須引数をパース
3. Validate エラー時のメッセージ整形 — 全エラーを人間可読な形式で表示

`from_toml` と `validate` は RFC 上では同一 impl ブロックに記述されているが、`from_toml` の実装（ファイル I/O + TOML デシリアライズ）と `validate` の実装（純粋ロジック検証）は責務が異なる。`validate` は M1-2 で既に実装済みであり、本チケットでは `from_toml` 内で `validate()` を呼び出す。

## Scope

### 実装項目

#### `AppConfig::from_toml(path: &Path) -> Result<Self, ConfigError>`

`src/config/mod.rs` の既存 `impl AppConfig` ブロックに追加:

```rust
pub fn from_toml(path: &Path) -> Result<Self, ConfigError> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| ConfigError::Io(path.to_string_lossy().to_string(), e))?;
    let config: Self = toml::from_str(&content)
        .map_err(|e| ConfigError::Parse(path.to_string_lossy().to_string(), e))?;
    config.validate().map_err(|errors| ConfigError::ValidationFailed(errors))?;
    Ok(config)
}
```

#### `src/cli.rs` — CLI 引数解析

```rust
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "anthropx", version, about = "Anthropic compatible API proxy server")]
pub struct Cli {
    /// Path to TOML configuration file
    #[arg(short = 't', long = "config", required = true)]
    pub config: PathBuf,
}

pub fn parse_args() -> Cli {
    Cli::parse()
}
```

#### Validate エラーメッセージ整形

`from_toml` 内で `validate()` が `Err(Vec<ConfigError>)` を返した場合、`ValidationFailed` でラップする。上位レイヤー（M4-1 起動シーケンス）でエラー表示することを想定。

### 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Cargo.toml` | **編集** | `clap` (features = ["derive"]) 追加 |
| `src/config/mod.rs` | **編集** | `impl AppConfig` に `from_toml()` 追加 |
| `src/cli.rs` | **新規** | clap `Cli` struct + `parse_args()` |
| `src/lib.rs` | **編集** | `pub mod cli;` 追加 |

### このチケットで実装しないこと

- `main.rs` での `from_toml` + `parse_args` の統合 — M4-2 (Binary entrypoint)
- `ProxyServer::start` の実装 — M4-1
- 設定ファイルの自動探索（デフォルトパス等）— CLI で明示的に指定
- `url_prefix` の正規化 — M4-1 または本チケットのあとに実施

## Investigation

### コードベース調査結果

- **発見1**: `AppConfig` の `impl` ブロックは `src/config/mod.rs` に既に存在し、`validate()` が実装済み。`from_toml()` は同一 `impl` ブロックに追記する。
- **発見2**: M1-2 の `validate()` は `Result<(), Vec<ConfigError>>` を返す。`from_toml` ではこの結果を `ConfigError::ValidationFailed` でラップして返す。
- **発見3**: `clap` はまだ依存に追加されていない。`features = ["derive"]` が必要。
- **発見4**: `toml::from_str` のエラー型は `toml::de::Error` で、`ConfigError::Parse` の第2要素と一致する。
- **発見5**: CLI のテストは clap の error 出力をキャプチャする必要がある。`Cli::try_parse_from` を使用すれば `-t` なしのケースを `assert!(result.is_err())` で検証可能。

### 依存関係の充足確認

| 先行チケット | ステータス | 備考 |
|------------|-----------|------|
| M0-1 (#155) | ✅ reviewed | AppConfig（型定義） |
| M0-2 (#156) | ✅ reviewed | ConfigError（エラー型） |
| M1-2 (#158) | ✅ reviewed | AppConfig::validate() |
| M2-1 (#159) | ✅ reviewed | 並行実装可能 |
| M2-2 (#160) | ✅ reviewed | 並行実装可能 |

## Test Plan

### ユニットテスト計画

#### `config/mod.rs` のテスト（`from_toml`）

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `from_toml_valid` | 正常系 | 有効な TOML 文字列 → `Ok(AppConfig)` 全フィールド一致 |
| 2 | `from_toml_not_found` | 異常系 | 存在しないファイル → `Err(ConfigError::Io)` |

※ TOML 文字列からのテストは `toml::from_str` を使用し、ファイル I/O を経由しない。

#### `cli.rs` のテスト

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 3 | `parse_args_with_config` | 正常系 | `["anthropx", "-t", "config.toml"]` → `Cli.config == "config.toml"` |
| 4 | `parse_args_missing_config` | 異常系 | `["anthropx"]` → clap がエラー終了 |

### ユニットテスト不可能な項目（例外）

- ファイル I/O の実際のレイテンシや権限エラー — OS 依存のため結合テスト（M4-3）でカバー
- Validate エラー表示の見た目 — 手動テストまたは E2E テスト
- `from_toml` から `validate()` が正しく呼ばれること — テスト2（無効値）でカバー（validate に依存）

## Boy Scout Rule — 翻訳可能性計画

- **関数名は動詞句**: `from_toml`, `parse_args` — 「ファイルから読む」「引数を解析する」
- **変数名はドメイン概念**: `config`, `path`, `content`, `errors`
- **エラーメッセージは英語**: 国際的なデバッグ環境向け（CLAUDE.md 言語プロトコル）
- **エラー伝播パターン**: `?` 演算子で一貫したエラー伝播。握りつぶし禁止

## Acceptance Criteria

- [ ] `cargo check -p anthropx` が警告ゼロで通過する
- [ ] `cargo clippy -D warnings` が通過する
- [ ] `cargo test -p anthropx` が全テスト（既存88 + 新規4 = 92 + 1 doctest）通過する
- [ ] `AppConfig::from_toml` が正常な TOML ファイルから設定を読み込める
- [ ] 存在しないファイルのパス → `ConfigError::Io`
- [ ] `cli::parse_args()` が `-t <path>` を正しくパースする
- [ ] `-t` なし → clap がエラー終了する

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **先行実装必須 (reviewed)** | M0-1 (#155) | AppConfig 型定義 |
| **先行実装必須 (reviewed)** | M0-2 (#156) | ConfigError |
| **先行実装必須 (reviewed)** | M1-2 (#158) | AppConfig::validate() |
| **後続** | M4-1 (#TBD) | ProxyServer::start → from_toml 呼び出し |
| **後続** | M4-2 (#TBD) | main.rs → cli::parse_args + from_toml 統合 |

---
ticket_id: 194
title: Feature gate 整備（m#6）
slug: feature-gate-m6
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0194-feature-gate-m6/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0194-feature-gate-m6/review.md
---

# Feature gate 整備（m#6）

## Summary

Cargo.toml の feature 構成を RFC02 §5 の設計通りに整備し、`cargo build --no-default-features` で library モードの最小ビルドが成功する状態を確立する。server feature に属する依存クレートを `optional = true` に変更し、ソースコード全体に `#[cfg(feature = "server")]` ガードを正しく配置する。

## Background

anthropx は単一バイナリとしてのサーバー稼働（server mode）と、他 Rust プロジェクトへの crate 埋め込み（library mode）のデュアルモード構成を採用している（RFC02 §5）。しかし、実装は RFC 設計を無視して以下の乖離が発生している：

1. **`cargo build --no-default-features` がコンパイルエラー** — library モードでの最小ビルドが成功しない
2. **server feature の依存リストが不完全** — `clap`、`futures`、`http`、`tokio-util`、`tokio-stream`、`tracing-subscriber` が unconditional 依存のまま残り、library モードでも不要なコンパイルが発生する
3. **`main.rs` の Conditional Compilation が不完全** — `#![cfg(feature = "server")]` ではなく `#![cfg_attr(not(feature = "server"), allow(dead_code))]` を使用しており、server feature なしでもバイナリビルドが試行される

これらの問題は REMAININGS.md m#6 で指摘され、RFC02 §5 で設計が完了しているが、実装に反映されていない。

## Scope

### 実施すること

1. **Cargo.toml**:
   - `clap`、`futures`、`http`、`tokio-util`、`tokio-stream`、`tracing-subscriber` を `optional = true` に変更
   - `server = [...]` feature に上記の `dep:*` を列挙
   - `metrics-exporter-prometheus` が依存にあれば同様に server feature 配下へ（現状は未追加）

2. **`src/main.rs`**:
   - `#![cfg_attr(not(feature = "server"), allow(dead_code))]` → `#![cfg(feature = "server")]` に変更

3. **モジュールレベルの feature ガード**（RFC02 §5.4 に従う）:
   - `src/cli.rs` — `#[cfg(feature = "server")]` でモジュール全体をガード（`clap` 依存）
   - `src/routing/mod.rs` — `llm_bridge_core` インポート部分を `#[cfg(feature = "server")]` でガード（モジュール本体は unconditional に維持）
   - `src/util/headers.rs` — `http` crate ではなく `reqwest::http::HeaderMap` に移行（これにより `http` crate は server feature 配下でも `util/` の unconditional 要件を満たす）
   - `lib.rs` の `pub use` で server-gated な型（`ProxyServer`）は既にガード済みだが、`pub mod cli` にガード追加

4. **検証**:
   - `cargo build --no-default-features` 成功
   - `cargo build`（デフォルト: server feature）成功
   - `cargo test` 全テスト通過

### 実施しないこと

- `reqwest`、`uuid`、`llm-bridge-core`、`axum` の feature 構成変更（既に server feature 配下で正しく設定済み）
- metrics crate 導入（M7-1 のスコープ）
- `tracing` crate の optional 化（library 用途でも `tracing::instrument` 等を使用するため unconditional 維持）
- `serde`、`serde_json`、`toml`、`thiserror` の optional 化（設定型のコア依存として unconditional 維持）

## Investigation

### 現状の Cargo.toml feature 構成（問題箇所）

`crates/anthropx/Cargo.toml`:

```toml
[dependencies]
# unconditional（問題なし）
serde = { version = "1", features = ["derive"] }
toml = "0.8"
thiserror = "2"
serde_json = "1"
tracing = "0.1.44"
tokio = { version = "1", features = ["sync"] }

# ❌ server feature 配下にすべきだが unconditional
clap = { version = "4", features = ["derive"] }
http = "1"
futures = "0.3.32"
tokio-util = { version = "0.7.18", features = ["io"] }
tokio-stream = "0.1.18"
tracing-subscriber = { version = "0.3.23", features = ["json"] }

# ✅ 既に optional + server feature 配下
axum = { version = "0.8.9", optional = true }
reqwest = { ..., optional = true }
uuid = { ..., optional = true }
llm-bridge-core = { ..., optional = true }

[features]
default = ["server"]
server = ["dep:axum", "dep:reqwest", "dep:uuid", "dep:llm-bridge-core", "tokio/full"]
# ↑ clap, futures, http, tokio-util, tokio-stream, tracing-subscriber が欠落
```

### `cargo build --no-default-features` の実際の動作確認

```text
error[E0433]: cannot find module or crate `llm_bridge_core` in this scope
  --> src/routing/mod.rs:14:5
   |
14 | use llm_bridge_core::model::ApiFormat as LlmApiFormat;
   |
```

`routing/mod.rs:14` が unconditional に `llm_bridge_core` をインポートしているため、`--no-default-features` では `llm_bridge_core` が利用不可となりコンパイル失敗。

### `#[cfg(feature = "server")]` の現在の配置状況

#### 正しくガード済み

| 箇所 | 行 | 内容 |
|------|-----|------|
| `src/app_state.rs` | L20, L31 | 構造体・実装ブロック |
| `src/lib.rs` | L24-L31 | `app_state`, `http`, `lifecycle`, `observability` モジュール宣言 |
| `src/lib.rs` | L47 | `pub use lifecycle::ProxyServer` |
| `src/util/ids.rs` | L16-L18 | `generate_request_id()` （UUID 実装） |
| `src/provider/mod.rs` | L8-L11 | `translate`, `transparent` サブモジュール |
| `src/provider/mod.rs` | L27 | `ProviderClient` 構造体 |
| `src/http/routes.rs` | L20 | モジュールレベルガード |

#### ガード不足・不完全

| 箇所 | 問題 |
|------|------|
| `src/main.rs:5` | `#![cfg_attr(not(feature = "server"), allow(dead_code))]` — 完全な cfg ガードではない |
| `src/cli.rs` | `use clap::Parser` が unconditional。モジュールごと server feature 配下にすべき |
| `src/routing/mod.rs:14` | `use llm_bridge_core::...` が unconditional（optional な crate を直接参照） |
| `src/util/mod.rs:5` | `mod headers;` が unconditional（`http` crate に依存） |
| `src/provider/mod.rs:13-15` | unconditional な import が 3 ヶ所（`ProviderConfig`、`ConcurrencyLimiter`、`KeyScheduler`）— ただし型は unconditional モジュール由来 |

### 依存クレートの使用箇所調査

| クレート | 使用ファイル | 現在の feature 状態 |
|----------|------------|-------------------|
| `clap` | `src/cli.rs`（`use clap::Parser`） | ❌ unconditional |
| `futures` | `src/provider/transparent.rs`（`StreamExt`）、`src/provider/translate.rs`（`StreamExt`） | ❌ unconditional（両方とも `#[cfg(feature = "server")]` 配下） |
| `http` | `src/util/headers.rs`（`header`, `HeaderMap`） | ❌ unconditional |
| `tokio-util` | `src/app_state.rs`、`src/lifecycle.rs`、`src/provider/*.rs`、`src/http/*.rs`（テスト含む）— 全て `#[cfg(feature = "server")]` 配下 | ❌ unconditional |
| `tokio-stream` | `src/provider/transparent.rs:144`（`ReceiverStream`）— `#[cfg(feature = "server")]` 配下 | ❌ unconditional |
| `tracing-subscriber` | `src/main.rs:22-27`（`tracing_subscriber::fmt()`） | ❌ unconditional |

### スタブ・犯罪の点検

スタブ 3 件（既存の `[::STUB::]` マーカー付き）を確認：
- `src/http/routes.rs:209`、`src/http/routes.rs:249` — テストヘルパー引数型
- `src/routing/mod.rs:24` — `ApiFormat` の `LlmApiFormat` 置き換え予定

未解決の犯罪（`[::STUB::]` 未付与の不完全実装）は検出されなかった。本チケットのスコープ内で新たなスタブは発生しない。

## Test Plan

### 検証項目（feature 構造の事後検証）

本チケットは依存構成の再編であり、新規ロジックは一切追加しない。したがって従来の単体テストに加え、以下のビルド検証を実施する：

1. **library 最小ビルド**: `cargo build --no-default-features -p anthropx` が成功すること
2. **サーバービルド**: `cargo build -p anthropx`（デフォルト feature）が成功すること
3. **全テスト**: `cargo test -p anthropx` が全テスト通過すること
4. **library モードでの型アクセス**: library モードで `use anthropx::AppConfig` がコンパイル可能であること（最小使用テストで確認）

### ユニットテスト計画

既存のユニットテストは維持され、feature gate 変更後も全テストが通過する。新規テストは不要（本チケットではロジック変更がないため）。

### ユニットテスト不可能な項目（例外）

- `cargo build --no-default-features` の成否はビルドシステムの検証であり、単体テストでは確認不可能
- 同様に、library モードでの `use anthropx::AppConfig` のコンパイル可否もビルド検証に依存

## Boy Scout Rule — 翻訳可能性計画

本チケットで触れるファイルは主に `Cargo.toml` と feature gate アトリビュートであり、翻訳可能性に直接影響するコードは少ない。以下の点に注意する：

- `src/main.rs` の `#![cfg(feature = "server")]` 変更により、main.rs が server feature 専用であることが一目でわかる
- `src/cli.rs` への `#[cfg(feature = "server")]` 追加により、「CLI 引数解析はサーバーモードのみで使用される」意図がコードから明確になる
- `src/routing/mod.rs` の `llm_bridge_core` インポートガードには、「この関数は translate mode でのみ使用され、translate は server feature 配下である」旨のコメントを追加する
- `src/util/headers.rs` の `reqwest::http` 移行に伴い、import 元のコメントを更新する

## Acceptance Criteria

- [ ] `cargo build --no-default-features -p anthropx` が成功する
- [ ] `cargo build -p anthropx`（デフォルト: server feature）が成功する
- [ ] `cargo test -p anthropx` が全テスト通過する
- [ ] `clap`、`futures`、`http`、`tokio-util`、`tokio-stream`、`tracing-subscriber` が `optional = true` かつ `server` feature 配下になっている
- [ ] `src/main.rs` に `#![cfg(feature = "server")]` が設定されている
- [ ] `src/util/headers.rs` が `reqwest::http::HeaderMap` を使用している
- [ ] 既存の `[::STUB::]` マーカーが維持されている（新たな犯罪を発生させていない）
- [ ] 翻訳可能性計画の各項目が適用されている

## Notes

- plan_path: 未作成（/plan-ticket 承認後に設定）
- implementation_path: 未作成（/start-ticket 実装完了後に設定）
- review_report_path: 未作成（/review-ticket 全チェック通過後に設定）

### 依存・関連チケット

- **先行**: なし
- **後続**: M7-1（metrics-exporter-prometheus が server feature 配下になるため本チケットで feature 構造を先に定義する）
- **後続**: M8-1（translate streaming の Conditional Compilation）

### 成果物

- 計画: context/0194-feature-gate-m6/plan.md（未作成）
- 実装サマリ: context/0194-feature-gate-m6/implementation.md（未作成）
- レビュー報告書: context/0194-feature-gate-m6/review.md（未作成）

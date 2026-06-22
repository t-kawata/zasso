# 実装サマリ: Feature gate 整備（m#6）

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `crates/anthropx/Cargo.toml` | 6クレートを `optional = true` に変更。`server` feature に `dep:*` 追加。`[[bin]] required-features` 追加 |
| `crates/anthropx/src/main.rs` | `#![cfg_attr(not(feature = "server"), allow(dead_code))]` → `#![cfg(feature = "server")]` |
| `crates/anthropx/src/lib.rs` | `pub mod cli;` に `#[cfg(feature = "server")]` 追加 |
| `crates/anthropx/src/routing/mod.rs` | `llm_bridge_core` インポート + `to_llm_api_format` 関数を `#[cfg(feature = "server")]` でガード |
| `crates/anthropx/src/util/headers.rs` | import 文に server feature の注釈追加（`http` crate は server feature 経由で利用） |
| `crates/anthropx/src/util/mod.rs` | `mod headers` / `pub use headers::*` に `#[cfg(feature = "server")]` 追加 |
| `crates/anthropx/src/provider/mod.rs` | 3つの unconditional import を `#[cfg(feature = "server")]` でガード |
| `crates/anthropx/src/config/mod.rs` | `ProxyError::Upstream(http::StatusCode)` → `Upstream(u16)`（config の unconditional 化を維持） |
| `crates/anthropx/src/provider/transparent.rs` | `resp.status()` → `resp.status().as_u16()`（u16 型変更対応） |
| `crates/anthropx/src/config/tests.rs` | `http::StatusCode::BAD_GATEWAY` → `502`（3箇所） |
| `crates/anthropx/src/http/errors.rs` | `http::StatusCode::BAD_GATEWAY` → `502`（2箇所） |

## server feature 配下になった依存クレート

- clap（CLI 引数解析）
- futures（非同期ストリーム処理）
- http（HTTP 型）
- tokio-util（CancellationToken）
- tokio-stream（SSE ストリーミング）
- tracing-subscriber（ログ出力）

## 検証結果

- `cargo build --no-default-features -p anthropx` → ✅ 成功（library 最小ビルド）
- `cargo build -p anthropx`（デフォルト: server） → ✅ 成功
- `cargo test -p anthropx` → ✅ 176 unit tests + 14 integration tests + 1 doc test 全通過

## スコープ外

- `reqwest` / `uuid` / `llm-bridge-core` / `axum` の feature 構成変更（既に server feature 配下）
- metrics crate 導入（M7-1）
- `tracing` crate（unconditional 維持）

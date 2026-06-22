//! # ユーティリティ関数
//!
//! HTTP ヘッダ処理、リクエスト ID 生成など、ルーティングに付随する純粋ロジック関数群。

/// server feature 有効時のみヘッダ処理モジュールをコンパイルする。
/// `build_upstream_headers` は reqwest::http に依存する。
#[cfg(feature = "server")]
mod headers;
pub mod ids;

#[cfg(feature = "server")]
pub use headers::*;

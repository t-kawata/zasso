//! # Provider モジュール
//!
//! Provider ごとの並行性制御・リクエスト実行を担当する。
//! 透過中継（transparent）とプロトコル変換（translate）の 2 モードを提供する。

pub mod limiter;
#[cfg(feature = "server")]
pub mod transparent;
#[cfg(feature = "server")]
pub mod translate;

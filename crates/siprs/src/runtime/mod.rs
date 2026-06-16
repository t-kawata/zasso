//! ランタイムモジュール。
//!
//! reactor thread が排他的に所有する内部状態とコマンド処理を提供する。

pub mod backend;
pub mod command;
pub mod handle;
pub mod reactor;
pub mod state;

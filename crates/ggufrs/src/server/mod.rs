//! Axum HTTP サーバー
//!
//! OpenAI 互換エンドポイント（`/v1/chat/completions`）および
//! Anthropic 互換エンドポイント（`/anthropic/v1/messages`）を提供する。
//!
//! ルーター + ハンドラは M4 フェーズで実装済み。
//! GgufEngine サーバー統合（start_server / new_with_auto_start / Drop）も同フェーズで実装済み。

pub mod openai;
pub mod router;
pub mod types;

pub use router::{build_router, AppError, AppState};

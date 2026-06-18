//! Axum HTTP サーバー
//!
//! OpenAI 互換エンドポイント（`/v1/chat/completions`）および
//! Anthropic 互換エンドポイント（`/anthropic/v1/messages`）を提供する。
//!
//! M4-1 でルーター + ハンドラを実装済み。
//! M4-2 で GgufEngine サーバー統合（start_server / new_with_auto_start / Drop）を実装済み。

pub mod openai;
pub mod router;

pub use router::{build_router, AppError, AppState};

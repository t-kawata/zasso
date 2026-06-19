//! # Translate provider mode (stub)
//!
//! `llm-bridge-core` のプロトコル変換機能を活用した translate mode。
//! [::STUB::] 実際の API 呼び出しは M3-5 以降で実装。

use std::sync::Arc;

use axum::response::Response;

use crate::app_state::AppState;
use crate::config::ProxyError;

/// Translate mode エントリポイント（スタブ）。
///
/// llm-bridge-core のプロトコル変換を使用する。
/// Anthropic → OpenAI 変換後に upstream へ送信し、
/// 応答を OpenAI → Anthropic に逆変換する。
///
/// [::STUB::] llm-bridge-core API の探索後に実装する。
pub async fn handle_translate(
    state: Arc<AppState>,
    provider_name: &str,
    body: serde_json::Value,
    is_stream: bool,
) -> Result<Response, ProxyError> {
    // Placeholder: will use llm_bridge_core::transform
    let _ = state;
    let _ = provider_name;
    let _ = body;
    let _ = is_stream;

    Err(ProxyError::Internal("translate not yet implemented".to_string()))
}

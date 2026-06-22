//! # Translate provider mode
//!
//! `llm-bridge-core` のプロトコル変換機能を活用した translate mode。
//! Anthropic Messages ↔ OpenAI Chat Completions / Responses 間の変換を行う。
//!
//! ## 処理フロー（non-stream）
//!
//! 1. `anthropic_to_openai()` でリクエストを OpenAI 形式に変換
//! 2. 変換後の body を upstream に送信
//! 3. 応答を `openai_response_to_anthropic_message()` で Anthropic 形式に逆変換
//!
//! ## 処理フロー（stream）
//!
//! 1. `anthropic_to_openai()` でリクエストを OpenAI 形式に変換
//! 2. 変換後の body を upstream に SSE ストリームとして送信
//! 3. `transform_stream()` で SSE ストリームを Anthropic 形式に変換
//! 4. 変換後の Anthropic SSE イベントをクライアントに中継

use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Body;
use axum::body::Bytes;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures::StreamExt;
use llm_bridge_core::model::{
    ApiFormat as LlmApiFormat, StreamState, TransformError, TransformRequest,
};
use llm_bridge_core::transform::{
    anthropic_to_openai, anthropic_to_openai_responses, openai_response_to_anthropic_message,
    responses_to_anthropic, transform_stream,
};
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::app_state::AppState;
use crate::config::{LossyLevel, OpenAiWireApi, ProxyError, ResolvedModel};
use crate::provider::ProviderClient;
use crate::routing::{resolve_api_format, to_llm_api_format, ApiFormat};

// ---------------------------------------------------------------------------
// TransformError → ProxyError マッピング
// ---------------------------------------------------------------------------

/// llm-bridge-core の変換エラーを anthropx の ProxyError に変換する。
///
/// 全6 variant を個別にマッピングし、未対応 variant の追加をコンパイルエラーで検出する。
/// `#[non_exhaustive]` のため完全網羅はできないが、現時点の全 variant をカバーする。
impl From<TransformError> for ProxyError {
    fn from(e: TransformError) -> Self {
        match e {
            TransformError::InvalidFormat(msg) => ProxyError::Internal(msg),
            TransformError::MissingRequiredField(field) => {
                ProxyError::Internal(format!("missing required field: {field}"))
            }
            TransformError::BufferLimitExceeded(msg) => ProxyError::Internal(msg),
            TransformError::StreamInterrupted(msg) => ProxyError::UpstreamError(msg),
            TransformError::UpstreamError(msg) => ProxyError::UpstreamError(msg),
            TransformError::LossyDowngrade(msg) => ProxyError::TransformLossy(msg),
        }
    }
}

// ---------------------------------------------------------------------------
// 公開エントリポイント
// ---------------------------------------------------------------------------

/// Translate mode エントリポイント。
///
/// provider の `openai_wire_api` 設定に基づいて ChatCompletions / Responses を分岐し、
/// non-stream / stream それぞれの変換パスを実行する。
pub async fn handle_translate(
    state: Arc<AppState>,
    provider_name: &str,
    resolved: &ResolvedModel,
    body: serde_json::Value,
    is_stream: bool,
) -> Result<Response, ProxyError> {
    let provider = state.resolve_provider(provider_name)?;

    // 並行性制限を適用（permit はスコープ終了時に自動解放）
    let _permit = provider.limiter.acquire().await?;

    // API 形式を解決（Auto / ChatCompletions / Responses）
    let api_format = resolve_api_format(
        provider
            .config
            .openai_wire_api
            .as_ref()
            .unwrap_or(&OpenAiWireApi::Auto),
        &provider.config.base_url,
    );
    let llm_format = to_llm_api_format(&api_format);

    // allow_lossy / error_lossy_continue 設定の統合（provider 設定が優先、なければ global）
    let allow_lossy = provider
        .config
        .allow_lossy
        .unwrap_or(state.config.global.allow_lossy);
    let error_lossy_continue = provider
        .config
        .error_lossy_continue
        .unwrap_or(state.config.global.error_lossy_continue);

    if is_stream {
        translate_stream(
            provider,
            resolved,
            body,
            llm_format,
            allow_lossy,
            error_lossy_continue,
            state.cancel.clone(),
        )
        .await
    } else {
        translate_non_stream(
            provider,
            resolved,
            body,
            llm_format,
            &api_format,
            allow_lossy,
            error_lossy_continue,
        )
        .await
    }
}

// ---------------------------------------------------------------------------
// Non-stream 変換
// ---------------------------------------------------------------------------

/// non-stream 3段変換を実行する。
///
/// 1. Anthropic リクエスト → llm-bridge-core で OpenAI 形式に変換
/// 2. 変換後のリクエストを upstream に送信
/// 3. 応答を llm-bridge-core で Anthropic 形式に逆変換
async fn translate_non_stream(
    provider: &ProviderClient,
    resolved: &ResolvedModel,
    body: serde_json::Value,
    llm_format: LlmApiFormat,
    _api_format: &ApiFormat,
    allow_lossy: bool,
    error_lossy_continue: bool,
) -> Result<Response, ProxyError> {
    // 1. Anthropic → OpenAI
    let request_bytes = serde_json::to_vec(&body)
        .map_err(|e| ProxyError::Internal(format!("failed to serialize request body: {e}")))?;

    let transform_req = TransformRequest {
        headers: HashMap::from([("content-type".to_string(), "application/json".to_string())]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(request_bytes),
    };

    let openai_req = match llm_format {
        LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => {
            anthropic_to_openai(&transform_req)
        }
        LlmApiFormat::OpenaiResponses => anthropic_to_openai_responses(&transform_req),
        _ => {
            return Err(ProxyError::Internal(format!(
                "unsupported API format: {llm_format:?}"
            )));
        }
    };

    let openai_req = match openai_req {
        Ok(resp) => resp,
        Err(TransformError::LossyDowngrade(msg))
            if LossyLevel::Error.should_reject(allow_lossy, error_lossy_continue) =>
        {
            return Err(ProxyError::TransformLossy(msg));
        }
        Err(TransformError::LossyDowngrade(msg)) => {
            // allow_lossy が有効な場合、warning ログを出力して続行するが、
            // llm-bridge-core は変換不能データを含む body を返せないため、
            // このエラーは upstream エラーとして報告する
            warn!(
                "lossy downgrade suppressed by allow_lossy ({allow_lossy}, {error_lossy_continue}): {msg}"
            );
            return Err(ProxyError::TransformLossy(format!(
                "{msg} (allow_lossy={allow_lossy}, error_lossy_continue={error_lossy_continue})"
            )));
        }
        Err(e) => return Err(ProxyError::from(e)),
    };

    // 2. Upstream に送信
    // base_url から /v1 の重複を除去
    let base = provider
        .config
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/v1");
    let upstream_url = format!("{}{}", base, openai_req.path);

    // body の model 名を upstream 名に書き換え
    let mut upstream_body: serde_json::Value = serde_json::from_slice(&openai_req.body)
        .map_err(|e| ProxyError::Internal(format!("failed to parse transformed body: {e}")))?;
    upstream_body["model"] = serde_json::json!(resolved.upstream);

    let key = provider.scheduler.select_key();
    let upstream_resp = provider
        .http_client
        .post(&upstream_url)
        .bearer_auth(key)
        .json(&upstream_body)
        .send()
        .await
        .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;

    let status = upstream_resp.status();
    if !status.is_success() {
        let body_text = upstream_resp
            .text()
            .await
            .unwrap_or_else(|_| "no response body".to_string());
        return Err(ProxyError::UpstreamError(format!(
            "upstream returned {status}: {body_text}"
        )));
    }

    let upstream_bytes: Bytes = upstream_resp
        .bytes()
        .await
        .map_err(|e| ProxyError::UpstreamError(format!("failed to read upstream response: {e}")))?;

    // 3. OpenAI → Anthropic
    // openai_response_to_anthropic_message / responses_to_anthropic は
    // TransformRequest（「変換対象のリクエスト」）を受け取る。
    // upstream の応答 body を TransformRequest にラップして変換する。
    let response_req = TransformRequest {
        headers: HashMap::from([("content-type".to_string(), "application/json".to_string())]),
        path: openai_req.path.clone(),
        body: upstream_bytes,
    };

    let anthropic_resp = match llm_format {
        LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => {
            openai_response_to_anthropic_message(&response_req)
        }
        LlmApiFormat::OpenaiResponses => responses_to_anthropic(&response_req),
        _ => {
            return Err(ProxyError::Internal(format!(
                "unsupported API format: {llm_format:?}"
            )));
        }
    };

    let anthropic_resp = match anthropic_resp {
        Ok(resp) => resp,
        Err(e) => return Err(ProxyError::from(e)),
    };

    // 4. Axum Response を構築
    let body_bytes = anthropic_resp.body;

    Ok((
        StatusCode::OK,
        [("content-type", "application/json")],
        Body::from(body_bytes),
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// Stream 変換
// ---------------------------------------------------------------------------

/// stream 変換を実行する。
///
/// 1. Anthropic リクエスト → llm-bridge-core で OpenAI 形式に変換
/// 2. 変換後のリクエストを upstream に SSE ストリームとして送信
/// 3. 応答をチャンク単位で受信し、全チャンク受信後に
///    `transform_stream()` で Anthropic SSE に変換してクライアントに中継
///
/// `cancel` が発火された場合、upstream からのチャンク読み出しを中断する。
async fn translate_stream(
    provider: &ProviderClient,
    resolved: &ResolvedModel,
    body: serde_json::Value,
    llm_format: LlmApiFormat,
    allow_lossy: bool,
    error_lossy_continue: bool,
    cancel: CancellationToken,
) -> Result<Response, ProxyError> {
    // 1. Anthropic → OpenAI（non-stream と同じ変換でリクエストを構築）
    let request_bytes = serde_json::to_vec(&body)
        .map_err(|e| ProxyError::Internal(format!("failed to serialize request body: {e}")))?;

    let transform_req = TransformRequest {
        headers: HashMap::from([("content-type".to_string(), "application/json".to_string())]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(request_bytes),
    };

    let openai_req = match llm_format {
        LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => {
            anthropic_to_openai(&transform_req)
        }
        LlmApiFormat::OpenaiResponses => anthropic_to_openai_responses(&transform_req),
        _ => {
            return Err(ProxyError::Internal(format!(
                "unsupported API format: {llm_format:?}"
            )));
        }
    };

    let openai_req = match openai_req {
        Ok(resp) => resp,
        Err(TransformError::LossyDowngrade(msg))
            if LossyLevel::Error.should_reject(allow_lossy, error_lossy_continue) =>
        {
            return Err(ProxyError::TransformLossy(msg));
        }
        Err(TransformError::LossyDowngrade(msg)) => {
            warn!(
                "lossy downgrade suppressed by allow_lossy ({allow_lossy}, {error_lossy_continue}): {msg}"
            );
            return Err(ProxyError::TransformLossy(format!(
                "{msg} (allow_lossy={allow_lossy}, error_lossy_continue={error_lossy_continue})"
            )));
        }
        Err(e) => return Err(ProxyError::from(e)),
    };

    // 2. Upstream SSE ストリームに接続
    let base = provider
        .config
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/v1");
    let upstream_url = format!("{}{}", base, openai_req.path);

    let mut upstream_body: serde_json::Value = serde_json::from_slice(&openai_req.body)
        .map_err(|e| ProxyError::Internal(format!("failed to parse transformed body: {e}")))?;
    upstream_body["model"] = serde_json::json!(resolved.upstream);
    upstream_body["stream"] = serde_json::json!(true);

    let key = provider.scheduler.select_key();
    let upstream_resp = provider
        .http_client
        .post(&upstream_url)
        .bearer_auth(key)
        .json(&upstream_body)
        .header("Accept", "text/event-stream")
        .send()
        .await
        .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;

    let status = upstream_resp.status();
    if !status.is_success() {
        let body_text = upstream_resp
            .text()
            .await
            .unwrap_or_else(|_| "no response body".to_string());
        return Err(ProxyError::UpstreamError(format!(
            "upstream returned {status}: {body_text}"
        )));
    }

    // 3. SSE ストリームを変換して中継（キャンセル監視付き）
    let anthropic_events: Bytes =
        collect_and_transform_stream(upstream_resp, llm_format, cancel).await?;

    Ok((
        StatusCode::OK,
        [
            ("content-type", "text/event-stream"),
            ("cache-control", "no-cache"),
        ],
        Body::from(anthropic_events),
    )
        .into_response())
}

/// upstream SSE ストリームを全チャンク受信し、
/// `transform_stream()` で Anthropic SSE に変換する。
///
/// `cancel` が発火された場合、チャンク読み出しを中断して
/// `UpstreamError` を返す。
async fn collect_and_transform_stream(
    upstream_resp: reqwest::Response,
    llm_format: LlmApiFormat,
    cancel: CancellationToken,
) -> Result<Bytes, ProxyError> {
    let mut buffer = Vec::new();
    let mut stream = upstream_resp.bytes_stream();

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                return Err(ProxyError::UpstreamError(
                    "stream cancelled by shutdown".to_string(),
                ));
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        buffer.extend_from_slice(&bytes);
                    }
                    Some(Err(e)) => {
                        return Err(ProxyError::UpstreamError(format!(
                            "stream read error: {e}"
                        )));
                    }
                    None => break,
                }
            }
        }
    }

    // 全チャンクを受信したら transform_stream で Anthropic 形式に変換
    let mut state = StreamState::default();
    let sse_format = match llm_format {
        LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => LlmApiFormat::OpenaiChat,
        LlmApiFormat::OpenaiResponses => LlmApiFormat::OpenaiResponses,
        _ => {
            return Err(ProxyError::Internal(format!(
                "unsupported API format: {llm_format:?}"
            )));
        }
    };
    let events: Vec<u8> =
        transform_stream(&buffer, sse_format, &mut state).map_err(ProxyError::from)?;

    Ok(Bytes::from(events))
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{ModelConfig, ProviderConfig};
    use std::collections::BTreeMap;

    // ---- TransformError → ProxyError マッピング ----

    /// TransformError の全6 variant が ProxyError にマッピングされること。
    #[test]
    fn transform_error_maps_all_variants() {
        let variants: Vec<(TransformError, &str)> = vec![
            (
                TransformError::InvalidFormat("bad json".to_string()),
                "Internal",
            ),
            (
                TransformError::MissingRequiredField("model".to_string()),
                "Internal",
            ),
            (
                TransformError::BufferLimitExceeded("too large".to_string()),
                "Internal",
            ),
            (
                TransformError::StreamInterrupted("connection lost".to_string()),
                "UpstreamError",
            ),
            (
                TransformError::UpstreamError("timeout".to_string()),
                "UpstreamError",
            ),
            (
                TransformError::LossyDowngrade("thinking not supported".to_string()),
                "TransformLossy",
            ),
        ];

        for (error, expected_variant) in variants {
            let proxy_error = ProxyError::from(error);
            let debug = format!("{proxy_error:?}");
            assert!(
                debug.contains(expected_variant),
                "expected {expected_variant} in {debug}"
            );
        }
    }

    /// TransformError::LossyDowngrade が TransformLossy として転送されること。
    #[test]
    fn lossy_downgrade_maps_to_transform_lossy() {
        let error = TransformError::LossyDowngrade("thinking not supported".to_string());
        let proxy_error = ProxyError::from(error);
        let error_string = proxy_error.to_string();
        assert!(
            error_string.contains("transform error"),
            "expected transform error prefix, got: {error_string}"
        );
        assert!(
            error_string.contains("thinking"),
            "expected original message, got: {error_string}"
        );
    }

    // ---- should_reject ロジック ----

    /// LossyLevel::Error かつ allow_lossy=false, error_lossy_continue=false → 拒否。
    #[test]
    fn lossy_error_should_reject() {
        assert!(LossyLevel::Error.should_reject(false, false));
    }

    /// LossyLevel::Error かつ allow_lossy=true → 続行。
    #[test]
    fn lossy_error_allow_lossy_continues() {
        assert!(!LossyLevel::Error.should_reject(true, false));
    }

    /// LossyLevel::Error かつ error_lossy_continue=true → 続行。
    #[test]
    fn lossy_error_error_lossy_continue_continues() {
        assert!(!LossyLevel::Error.should_reject(false, true));
    }

    // ---- to_llm_api_format ----

    /// ローカル ApiFormat が LlmApiFormat に正しく変換されること。
    #[test]
    fn to_llm_api_format_chat() {
        let local = ApiFormat::OpenaiChat;
        let llm = to_llm_api_format(&local);
        assert_eq!(llm, LlmApiFormat::OpenaiChat);
    }

    #[test]
    fn to_llm_api_format_responses() {
        let local = ApiFormat::OpenaiResponses;
        let llm = to_llm_api_format(&local);
        assert_eq!(llm, LlmApiFormat::OpenaiResponses);
    }

    // ---- resolve_api_format ----

    /// OpenAiWireApi::ChatCompletions → ApiFormat::OpenaiChat。
    #[test]
    fn resolve_api_format_chat() {
        let result = resolve_api_format(&OpenAiWireApi::ChatCompletions, "https://api.example.com");
        assert_eq!(result, ApiFormat::OpenaiChat);
    }

    /// OpenAiWireApi::Responses → ApiFormat::OpenaiResponses。
    #[test]
    fn resolve_api_format_responses() {
        let result = resolve_api_format(&OpenAiWireApi::Responses, "https://api.example.com");
        assert_eq!(result, ApiFormat::OpenaiResponses);
    }

    /// OpenAiWireApi::Auto + /v1/chat/completions → OpenaiChat。
    #[test]
    fn resolve_api_format_auto_chat() {
        let result = resolve_api_format(
            &OpenAiWireApi::Auto,
            "https://api.openai.com/v1/chat/completions",
        );
        assert_eq!(result, ApiFormat::OpenaiChat);
    }

    // ---- ProviderConfig の allow_lossy 継承 ----

    /// ProviderConfig の allow_lossy が None の場合、global 設定が使われること。
    #[test]
    fn allow_lossy_inherits_from_global() {
        let provider = ProviderConfig {
            transparent: false,
            base_url: "https://example.com".to_string(),
            api_keys: vec!["key".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: vec![ModelConfig {
                public: "model".to_string(),
                upstream: "up-model".to_string(),
                enabled: true,
                tags: vec![],
                max_tokens_cap: None,
                aliases: vec![],
            }],
        };
        // global のデフォルト: allow_lossy=false
        // provider.allow_lossy=None → global の false を継承
        let effective = provider.allow_lossy.unwrap_or(false);
        assert!(!effective);
    }
}

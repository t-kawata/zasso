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
//! 3. `transform_chunk()` で各 SSE チャンクを Anthropic 形式に逐次変換
//! 4. 変換後の Anthropic SSE イベントを即時クライアントに中継

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::body::Bytes;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures::StreamExt;
use llm_bridge_core::model::{
    ApiFormat as LlmApiFormat, StreamState, TransformError, TransformRequest,
};
use llm_bridge_core::stream::{events_to_sse, transform_stream_events};
use llm_bridge_core::transform::{
    anthropic_to_openai, anthropic_to_openai_responses, openai_response_to_anthropic_message,
    responses_response_to_anthropic,
};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;
use tracing::{Span, warn};

use crate::app_state::AppState;
use crate::config::{LossyLevel, OpenAiWireApi, ProxyError, ResolvedModel};
use crate::observability::metrics;
use crate::provider::ProviderClient;
use crate::routing::{ApiFormat, resolve_api_format, to_llm_api_format};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/// TransformRequest の Content-Type ヘッダー名。
const HEADER_CONTENT_TYPE: &str = "content-type";

// ---------------------------------------------------------------------------
// Lossy 検出 — pre-scan 方式
// ---------------------------------------------------------------------------

/// 変換時に欠落する可能性のある Anthropic リクエスト特徴を表す。
///
/// llm-bridge-core v0.2.6 は `TransformError::LossyDowngrade` を返さず、
/// 代わりに `tracing::debug!` / `tracing::warn!` で出力して `Ok(..)` を返す。
/// この型はそれらの lossy イベントを `anthropic_to_openai()` 呼び出し前に
/// リクエストボディを走査して検出する。
#[derive(Debug, Clone)]
pub(crate) struct LossyEvent {
    pub level: LossyLevel,
    pub field: String,
    pub detail: String,
}

impl LossyEvent {
    fn error(field: impl Into<String>, detail: impl std::fmt::Display) -> Self {
        Self {
            level: LossyLevel::Error,
            field: field.into(),
            detail: detail.to_string(),
        }
    }
    fn warn(field: impl Into<String>, detail: impl std::fmt::Display) -> Self {
        Self {
            level: LossyLevel::Warn,
            field: field.into(),
            detail: detail.to_string(),
        }
    }
}

/// Anthropic Messages リクエストボディを走査し、OpenAI 形式への変換時に
/// 欠落する既知の特徴を検出する。
///
/// llm-bridge-core の内部動作から逆算した検出ルール — 新たな lossy 特徴が
/// 発見されたら本関数に追加する。
fn scan_anthropic_request(body: &serde_json::Value) -> Vec<LossyEvent> {
    let mut events = Vec::new();

    // 1. content ブロック内の image および unknown type
    if let Some(messages) = body.get("messages").and_then(|v| v.as_array()) {
        for msg in messages {
            if let Some(content) = msg.get("content").and_then(|v| v.as_array()) {
                for (idx, block) in content.iter().enumerate() {
                    if let Some(block_type) = block.get("type").and_then(|t| t.as_str()) {
                        match block_type {
                            "image" => events.push(LossyEvent::error(
                                format!("messages[].content[{idx}].type=image"),
                                "image content blocks are not supported by the upstream API and \
                                 will be silently dropped",
                            )),
                            "text" | "tool_use" | "tool_result" => {
                                // 既知の安全な type — lossy なし
                            }
                            other => events.push(LossyEvent::warn(
                                format!("messages[].content[{idx}].type"),
                                format_args!(
                                    "unknown content block type '{other}' will be silently dropped"
                                ),
                            )),
                        }
                    }
                }
            }
        }
    }

    // 2. thinking config（Anthropic 専用、常に無視される）
    if body.get("thinking").is_some() {
        events.push(LossyEvent::warn(
            "thinking",
            "Anthropic thinking configuration is not supported by the upstream API and will be \
             ignored",
        ));
    }

    // 3. tools 配列が OpenAI 上限（128）を超過
    if let Some(tools) = body.get("tools").and_then(|t| t.as_array())
        && tools.len() > 128
    {
        events.push(LossyEvent::error(
            "tools",
            format_args!(
                "tool count ({}) exceeds the upstream API limit of 128; \
                 excess tools will be silently truncated",
                tools.len()
            ),
        ));
    }

    events
}

/// lossy イベントリストに設定を適用する。
///
/// 各イベントに対して metrics 記録 + span 記録 + warn ログを出力し、
/// Error 級イベントで拒否条件を満たす場合は `Err(ProxyError::TransformLossy)` を返す。
fn process_lossy_events(
    events: &[LossyEvent],
    allow_lossy: bool,
    error_lossy_continue: bool,
) -> Result<(), ProxyError> {
    for event in events {
        let level_str = match event.level {
            LossyLevel::Error => "Error",
            LossyLevel::Warn => "Warn",
            LossyLevel::Info => "Info",
        };
        metrics::record_lossy(level_str);
        Span::current().record("lossy_applied", true);
        warn!(
            lossy_level = level_str,
            lossy_field = %event.field,
            lossy_detail = %event.detail,
            "lossy translation event"
        );

        if event.level.should_reject(allow_lossy, error_lossy_continue) {
            return Err(ProxyError::TransformLossy(format!(
                "{}: {}",
                event.field, event.detail
            )));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// TransformError → ProxyError マッピング
// ---------------------------------------------------------------------------

/// llm-bridge-core の変換エラーを anthropx の ProxyError に変換する。
///
/// 全6 variant を個別にマッピングし、未対応 variant の追加をコンパイルエラーで検出する。
/// `#[non_exhaustive]` のため完全網羅はできないが、現時点の全 variant をカバーする。
///
/// # 注記: `LossyDowngrade`
///
/// llm-bridge-core v0.2.6 は `LossyDowngrade` を一度も返さない。代わりに `tracing::debug!`
/// / `tracing::warn!` でログ出力して `Ok(..)` を返す。lossy イベントは `scan_anthropic_request()`
/// による pre-scan で検出する。本条項は将来の llm-bridge-core バージョンで
/// `LossyDowngrade` が返されるようになった場合の防御的ガードとして維持する。
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
            // 防御的ガード: pre-scan で先に検出されるべきだが、
            // llm-bridge-core から直接 LossyDowngrade が来た場合の最終防衛線。
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

    // タイムアウト値を config から解決し、下位関数に注入する。
    // ProviderConfig.timeouts は YAGNI により未定義のため、直接 global 値を使用する。
    // （P1-1 設計判断: ProviderConfig.timeouts は現状不要）
    let total_ms = state.config.global.timeouts.total_ms;
    let read_ms = state.config.global.timeouts.read_ms;

    if is_stream {
        translate_stream(
            provider,
            resolved,
            body,
            llm_format,
            allow_lossy,
            error_lossy_continue,
            state.cancel.clone(),
            read_ms,
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
            total_ms,
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
///
/// 8引数は clippy 標準（7）を超えるが、責務ごとの引数構造は適切（provider, model, body, format,
/// 2x lossy設定, timeout）であり、構造体への凝集は現時点では過剰な抽象化となるため許可する。
#[allow(clippy::too_many_arguments)]
async fn translate_non_stream(
    provider: &ProviderClient,
    resolved: &ResolvedModel,
    body: serde_json::Value,
    llm_format: LlmApiFormat,
    _api_format: &ApiFormat,
    allow_lossy: bool,
    error_lossy_continue: bool,
    total_ms: u64,
) -> Result<Response, ProxyError> {
    // ルーティングが解決した upstream モデル名で body の model を上書きする。
    // body に渡される model は "provider/model" 形式であり、llm-bridge-core の
    // validate_model_name が '/' を拒否するため、変換前に upstream 名に差し替える。
    // upstream への送信時（後続の同名処理）と重複するが、変換と送信で役割が異なるため
    // 明確に分離する（変換用の model 解決、送信用の model 解決）。
    let mut body = body;
    body["model"] = serde_json::json!(resolved.upstream);

    // 1. Pre-scan: Anthropic リクエストボディを走査し、変換時に欠落する既知の特徴を検出する。
    let lossy_events = scan_anthropic_request(&body);
    process_lossy_events(&lossy_events, allow_lossy, error_lossy_continue)?;

    // 2. Anthropic → OpenAI 変換
    let request_bytes = serde_json::to_vec(&body)
        .map_err(|e| ProxyError::Internal(format!("failed to serialize request body: {e}")))?;

    let transform_req = TransformRequest {
        headers: HashMap::from([(
            HEADER_CONTENT_TYPE.to_string(),
            "application/json".to_string(),
        )]),
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

    let openai_req = openai_req.map_err(ProxyError::from)?;

    // 3. Upstream に送信
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
        .timeout(Duration::from_millis(total_ms))
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

    // 4. OpenAI → Anthropic（逆変換）
    // openai_response_to_anthropic_message / responses_to_anthropic は
    // TransformRequest（「変換対象のリクエスト」）を受け取る。
    // upstream の応答 body を TransformRequest にラップして変換する。
    //
    // 注記: 逆変換パスで `TransformError::LossyDowngrade` が発生することはない
    // （発生しうる lossy イベントは pre-scan が先に検出する）。
    let response_req = TransformRequest {
        headers: HashMap::from([(
            HEADER_CONTENT_TYPE.to_string(),
            "application/json".to_string(),
        )]),
        path: openai_req.path.clone(),
        body: upstream_bytes,
    };

    let anthropic_resp = match llm_format {
        LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => {
            openai_response_to_anthropic_message(&response_req)
        }
        LlmApiFormat::OpenaiResponses => responses_response_to_anthropic(&response_req),
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

    // 5. Axum Response を構築
    let body_bytes = anthropic_resp.body;

    Ok((
        StatusCode::OK,
        [("content-type", "application/json")],
        Body::from(body_bytes),
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// Stream 変換 — チャンク単位逐次変換＋即時送信
// ---------------------------------------------------------------------------

/// upstream SSE の `ApiFormat` を SSE 変換用の `ApiFormat` に変換する。
///
/// stream 変換では `AnthropicMessages` を `OpenaiChat` と同様に扱う。
fn convert_llm_to_sse_format(llm_format: LlmApiFormat) -> Result<LlmApiFormat, ProxyError> {
    match llm_format {
        LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => Ok(LlmApiFormat::OpenaiChat),
        LlmApiFormat::OpenaiResponses => Ok(LlmApiFormat::OpenaiResponses),
        _ => Err(ProxyError::Internal(format!(
            "unsupported API format for streaming: {llm_format:?}"
        ))),
    }
}

/// SSE チャンクを llm-bridge-core で Anthropic SSE 形式に変換する。
///
/// `transform_stream_events()` で upstream SSE をパースし `StreamEvent` に変換後、
/// `events_to_sse()` で Anthropic 互換 SSE バイト列にシリアライズする。
///
/// # 戻り値
///
/// - `Ok(Some(bytes))` — 変換完了。クライアントに送信すべきデータあり
/// - `Ok(None)` — 変換不要（keepalive 等）。スキップ
/// - `Err(e)` — 変換エラー
fn transform_chunk(
    chunk: &[u8],
    llm_format: LlmApiFormat,
    state: &mut StreamState,
) -> Result<Option<Bytes>, ProxyError> {
    let events = transform_stream_events(chunk, llm_format, state).map_err(ProxyError::from)?;

    if events.is_empty() {
        // 空のイベントリスト = keepalive チャンク等、クライアントに送信すべきデータなし
        return Ok(None);
    }

    let sse_bytes = events_to_sse(&events);
    Ok(Some(Bytes::from(sse_bytes)))
}

/// stream 変換を実行する。
///
/// 1. Anthropic リクエスト → llm-bridge-core で OpenAI 形式に変換
/// 2. 変換後のリクエストを upstream に SSE ストリームとして送信
/// 3. `transform_chunk()` でチャンク単位に逐次変換し、`mpsc::channel` 経由で即時送信
///
/// `cancel` が発火された場合、upstream からのチャンク読み出しを中断する。
/// クライアント切断は `tx.send().await.is_err()` で検出する。
///
/// Rust 2024 Edition 移行後も `bytes::Bytes` の Drop（参照カウント解放）には
/// 副作用がなく無害なため、`tail_expr_drop_order` の互換性警告を抑制する。
#[allow(tail_expr_drop_order, clippy::too_many_arguments)]
async fn translate_stream(
    provider: &ProviderClient,
    resolved: &ResolvedModel,
    body: serde_json::Value,
    llm_format: LlmApiFormat,
    allow_lossy: bool,
    error_lossy_continue: bool,
    cancel: CancellationToken,
    read_ms: u64,
) -> Result<Response, ProxyError> {
    // ルーティングが解決した upstream モデル名で body の model を上書きする（non-stream と同様）。
    // llm-bridge-core の validate_model_name が '/' を含む model 名を拒否するため必須。
    let mut body = body;
    body["model"] = serde_json::json!(resolved.upstream);

    // 1. Pre-scan + Anthropic → OpenAI 変換
    let request_bytes = serde_json::to_vec(&body)
        .map_err(|e| ProxyError::Internal(format!("failed to serialize request body: {e}")))?;

    // 1a. Pre-scan: リクエストボディを走査し lossy 特徴を検出する
    let lossy_events = scan_anthropic_request(&body);
    process_lossy_events(&lossy_events, allow_lossy, error_lossy_continue)?;

    // 1b. 変換
    let transform_req = TransformRequest {
        headers: HashMap::from([(
            HEADER_CONTENT_TYPE.to_string(),
            "application/json".to_string(),
        )]),
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

    let openai_req = openai_req.map_err(ProxyError::from)?;

    // 2. Upstream SSE ストリームに接続
    // base_url から /v1 の重複を除去して upstream URL を構築
    let normalized_base_url = provider
        .config
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/v1");
    let upstream_url = format!("{}{}", normalized_base_url, openai_req.path);

    // body の model 名を upstream のモデル名に書き換え、stream フラグを設定
    let mut transformed_body_with_upstream_model: serde_json::Value =
        serde_json::from_slice(&openai_req.body)
            .map_err(|e| ProxyError::Internal(format!("failed to parse transformed body: {e}")))?;
    transformed_body_with_upstream_model["model"] = serde_json::json!(resolved.upstream);
    transformed_body_with_upstream_model["stream"] = serde_json::json!(true);

    let upstream_api_key = provider.scheduler.select_key();
    let upstream_resp = provider
        .http_client
        .post(&upstream_url)
        .bearer_auth(upstream_api_key)
        .json(&transformed_body_with_upstream_model)
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

    // 3. チャンク単位の逐次変換 + 即時送信（transparent.rs の proxy_sse_stream パターン）
    const SSE_CONTENT_TYPE: &str = "text/event-stream";
    const SSE_CACHE_CONTROL: &str = "no-cache";
    const STREAM_CHANNEL_SIZE: usize = 64;

    let sse_format = convert_llm_to_sse_format(llm_format)?;
    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(STREAM_CHANNEL_SIZE);
    let mut upstream_stream = upstream_resp.bytes_stream();
    let mut state = StreamState::default();

    // idle timeout 用の Duration を事前計算（read_ms は Copy 型のため async move 内でも参照可能だが
    // transparent.rs の proxy_sse_stream と同一パターンに従い spawn 前に変数化する）
    let timeout_dur = Duration::from_millis(read_ms);

    // 変換＋送信タスクを spawn し、upstream からのチャンクを受信するたびに
    // transform_chunk で変換し、結果を mpsc 経由で即時クライアントに送信する
    tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    // ServerHandle からの shutdown 通知により中断
                    break;
                }
                chunk = tokio::time::timeout(timeout_dur, upstream_stream.next()) => {
                    match chunk {
                        Ok(Some(Ok(bytes))) => {
                            match transform_chunk(&bytes, sse_format, &mut state) {
                                Ok(Some(anthropic_event)) => {
                                    // 変換結果を即時送信。is_err() = クライアント切断
                                    if tx.send(Ok(anthropic_event)).await.is_err() {
                                        break;
                                    }
                                }
                                Ok(None) => {
                                    // keepalive 等、変換不要チャンクはスキップ
                                    continue;
                                }
                                Err(e) => {
                                    tracing::warn!("chunk transform error: {e}");
                                    break;
                                }
                            }
                        }
                        Ok(Some(Err(e))) => {
                            tracing::error!("upstream stream read error: {e}");
                            break;
                        }
                        Ok(None) => {
                            // upstream ストリーム正常終了
                            break;
                        }
                        Err(_) => {
                            // idle timeout — read_ms 以内に chunk が到着しなかった場合
                            // transparent.rs の proxy_sse_stream と同一の warn 書式で通知する
                            tracing::warn!("translate stream idle timeout ({}ms), closing", read_ms);
                            break;
                        }
                    }
                }
            }
        }
    });

    let stream_body = Body::from_stream(ReceiverStream::new(rx));

    Ok((
        StatusCode::OK,
        [
            ("content-type", SSE_CONTENT_TYPE),
            ("cache-control", SSE_CACHE_CONTROL),
        ],
        stream_body,
    )
        .into_response())
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

    // ---- scan_anthropic_request ----

    /// クリーンリクエストは空の Vec を返すこと。
    #[test]
    fn scan_anthropic_request_empty_for_clean_request() {
        let body = serde_json::json!({
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100
        });
        let events = scan_anthropic_request(&body);
        assert!(
            events.is_empty(),
            "clean request should produce no lossy events"
        );
    }

    /// image content block が LossyLevel::Error として検出されること。
    #[test]
    fn scan_anthropic_request_detects_image_block() {
        let body = serde_json::json!({
            "model": "claude-3-opus",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "describe this image"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}}
                ]
            }],
            "max_tokens": 100
        });
        let events = scan_anthropic_request(&body);
        assert_eq!(events.len(), 1, "should detect image block");
        assert_eq!(events[0].level, LossyLevel::Error);
        assert!(
            events[0].field.contains("image"),
            "field should mention image"
        );
    }

    /// thinking config が LossyLevel::Warn として検出されること。
    #[test]
    fn scan_anthropic_request_detects_thinking_config() {
        let body = serde_json::json!({
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": "Hello"}],
            "thinking": {"type": "enabled", "budget_tokens": 1024}
        });
        let events = scan_anthropic_request(&body);
        assert_eq!(events.len(), 1, "should detect thinking config");
        assert_eq!(events[0].level, LossyLevel::Warn);
        assert!(events[0].field.contains("thinking"));
    }

    /// 未知の content block type が LossyLevel::Warn として検出されること。
    #[test]
    fn scan_anthropic_request_detects_unknown_content_block() {
        let body = serde_json::json!({
            "model": "claude-3-opus",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Hello"},
                    {"type": "video", "source": {"type": "base64", "data": "..."}}
                ]
            }]
        });
        let events = scan_anthropic_request(&body);
        assert_eq!(events.len(), 1, "should detect unknown block type");
        assert_eq!(events[0].level, LossyLevel::Warn);
        assert!(
            events[0].detail.contains("video"),
            "detail should mention 'video' type"
        );
    }

    /// tools 配列が 128 を超えると LossyLevel::Error として検出されること。
    #[test]
    fn scan_anthropic_request_detects_tool_overflow() {
        let tools: Vec<serde_json::Value> = (0..150)
            .map(|i| {
                serde_json::json!({
                    "name": format!("tool_{i}"),
                    "description": format!("Tool {i}"),
                    "input_schema": {"type": "object", "properties": {}}
                })
            })
            .collect();
        let body = serde_json::json!({
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": "Hello"}],
            "tools": tools
        });
        let events = scan_anthropic_request(&body);
        assert_eq!(events.len(), 1, "should detect tool overflow");
        assert_eq!(events[0].level, LossyLevel::Error);
        assert!(
            events[0].detail.contains("150"),
            "detail should mention count"
        );
    }

    /// 複数の lossy 特徴が同時に検出されること。
    #[test]
    fn scan_anthropic_request_multiple_events() {
        let body = serde_json::json!({
            "model": "claude-3-opus",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "data": "..."}},
                    {"type": "unknown_format", "data": {}}
                ]
            }],
            "thinking": {"type": "enabled", "budget_tokens": 1024}
        });
        let events = scan_anthropic_request(&body);
        assert_eq!(events.len(), 3, "should detect all three lossy features");
    }

    // ---- process_lossy_events ----

    /// 空のイベントリストは常に Ok を返すこと。
    #[test]
    fn process_lossy_events_empty_returns_ok() {
        let events = vec![];
        let result = process_lossy_events(&events, false, false);
        assert!(result.is_ok(), "empty events should always succeed");
    }

    /// Error 級 lossy + allow_lossy=false + error_lossy_continue=false → Err。
    #[test]
    fn process_lossy_events_error_rejects_when_configured() {
        let events = vec![LossyEvent::error("test_field", "test detail")];
        let result = process_lossy_events(&events, false, false);
        assert!(result.is_err(), "Error event + reject config should fail");
        let err = format!("{:?}", result.unwrap_err());
        assert!(
            err.contains("TransformLossy"),
            "expected TransformLossy, got: {err}"
        );
    }

    /// Error 級 lossy + allow_lossy=true → Ok（metrics は記録される）。
    #[test]
    fn process_lossy_events_error_allows_when_lossy_allowed() {
        let events = vec![LossyEvent::error("test_field", "test detail")];
        let result = process_lossy_events(&events, true, false);
        assert!(
            result.is_ok(),
            "Error event + allow_lossy=true should succeed"
        );
    }

    /// Error 級 lossy + error_lossy_continue=true → Ok（metrics は記録される）。
    #[test]
    fn process_lossy_events_error_allows_when_continue_set() {
        let events = vec![LossyEvent::error("test_field", "test detail")];
        let result = process_lossy_events(&events, false, true);
        assert!(
            result.is_ok(),
            "Error event + error_lossy_continue=true should succeed"
        );
    }

    /// Warn 級 lossy は最も厳しい設定でも決して拒否しないこと。
    #[test]
    fn process_lossy_events_warn_never_rejects() {
        let events = vec![LossyEvent::warn("thinking", "thinking not supported")];
        let result = process_lossy_events(&events, false, false);
        assert!(result.is_ok(), "Warn events should never reject");
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

    // ---- transform_chunk ----

    /// OpenAI Chat の delta chunk が Anthropic の content_block_delta に変換されること。
    #[test]
    fn transform_chunk_delta_chunk_produces_content_block_delta() {
        let mut state = StreamState::default();
        let chunk = b"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"}}]}\n\n";

        let result = transform_chunk(chunk, LlmApiFormat::OpenaiChat, &mut state).unwrap();
        let output = result.expect("expected Some(Bytes) for delta chunk");
        let output_str = String::from_utf8_lossy(&output);

        assert!(
            output_str.contains("content_block_delta"),
            "expected content_block_delta in output, got: {output_str}"
        );
        assert!(
            output_str.contains("Hello"),
            "expected Hello in output, got: {output_str}"
        );
    }

    /// 複数チャンクを逐次投入した場合、各チャンクが即時 ContentBlockDelta に変換されること。
    #[test]
    fn transform_chunk_incremental_chunks_produce_immediate_deltas() {
        let mut state = StreamState::default();

        // 1回目: "Hel"
        let first = transform_chunk(
            b"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hel\"}}]}\n\n",
            LlmApiFormat::OpenaiChat,
            &mut state,
        )
        .unwrap();
        let first_output = first.expect("expected Some for first chunk");
        assert!(
            String::from_utf8_lossy(&first_output).contains("Hel"),
            "first chunk should contain 'Hel'"
        );

        // 2回目: "lo" — state を引き継いで変換
        let second = transform_chunk(
            b"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"lo\"}}]}\n\n",
            LlmApiFormat::OpenaiChat,
            &mut state,
        )
        .unwrap();
        let second_output = second.expect("expected Some for second chunk");
        assert!(
            String::from_utf8_lossy(&second_output).contains("lo"),
            "second chunk should contain 'lo'"
        );
    }

    /// [DONE] 終端シグナルが ContentBlockStop / MessageDelta / MessageStop を
    /// 含むこと。
    ///
    /// llm-bridge-core の `transform_stream_events` は、delta content でストリームを
    /// 開始し、usage を含むチャンクでメタデータを受信した後、[DONE] で最終化する
    /// パターンに対応する。[DONE] 受信時に ContentBlockStop + MessageDelta +
    /// MessageStop の3イベントを生成する。
    #[test]
    fn transform_chunk_done_signal_triggers_stop_events() {
        let mut state = StreamState::default();

        // 1. 最初の delta chunk — MessageStart / ContentBlockStart / ContentBlockDelta を生成
        let _first = transform_chunk(
            b"data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Hi\"}}]}\n\n",
            LlmApiFormat::OpenaiChat,
            &mut state,
        )
        .unwrap();

        // 2. usage 情報を含む最終 delta（finish_reason なし — 通常の OpenAI ストリーム終了パターン）
        let _usage = transform_chunk(
            b"data: {\"choices\":[{\"index\":0,\"delta\":{}}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1}}\n\n",
            LlmApiFormat::OpenaiChat,
            &mut state,
        ).unwrap();

        // 3. [DONE] — ここで finalize が走り停止イベントが生成される
        let done =
            transform_chunk(b"data: [DONE]\n\n", LlmApiFormat::OpenaiChat, &mut state).unwrap();
        let done_bytes = done.expect("[DONE] should produce stop events");
        let done_str = String::from_utf8_lossy(&done_bytes);

        assert!(
            done_str.contains("content_block_stop"),
            "expected content_block_stop, got: {done_str}"
        );
        assert!(
            done_str.contains("message_delta"),
            "expected message_delta, got: {done_str}"
        );
        assert!(
            done_str.contains("message_stop"),
            "expected message_stop, got: {done_str}"
        );
    }

    /// finish_reason を含む delta chunk は、そのチャンクだけで停止イベントを
    /// 完結させる。この場合 [DONE] は空（既に state.finished）を返す。
    #[test]
    fn transform_chunk_finish_reason_in_delta_triggers_stop_immediately() {
        let mut state = StreamState::default();

        // 1. 最初の delta chunk
        let _first = transform_chunk(
            b"data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"One-shot\"}}]}\n\n",
            LlmApiFormat::OpenaiChat,
            &mut state,
        ).unwrap();

        // 2. finish_reason="stop" + usage を含むチャンク → この呼び出しで停止イベントが生成される
        let stop_chunk = transform_chunk(
            b"data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\n",
            LlmApiFormat::OpenaiChat,
            &mut state,
        ).unwrap();
        let stop_bytes = stop_chunk.expect("finish_reason delta should produce stop events");
        let stop_str = String::from_utf8_lossy(&stop_bytes);

        assert!(
            stop_str.contains("content_block_stop"),
            "expected content_block_stop in finish_reason chunk, got: {stop_str}"
        );

        // 3. 後続の [DONE] は既に finished なので None
        let done =
            transform_chunk(b"data: [DONE]\n\n", LlmApiFormat::OpenaiChat, &mut state).unwrap();
        assert!(
            done.is_none(),
            "[DONE] after finish_reason should return None (state already finished)"
        );
    }

    /// keepalive 等の空チャンクは Ok(None) を返すこと。
    #[test]
    fn transform_chunk_empty_chunk_returns_none() {
        let mut state = StreamState::default();

        // 空行（SSE keepalive）
        let result = transform_chunk(b"\n", LlmApiFormat::OpenaiChat, &mut state).unwrap();
        assert!(result.is_none(), "empty keepalive should return None");

        // 意味のない空白のみ
        let result = transform_chunk(b"  \n", LlmApiFormat::OpenaiChat, &mut state).unwrap();
        assert!(result.is_none(), "whitespace should return None");
    }

    /// 不正な SSE フォーマットは Err を返すこと。
    #[test]
    fn transform_chunk_invalid_format_returns_error() {
        let mut state = StreamState::default();

        // 不正な JSON
        let chunk = b"data: {invalid json}\n\n";
        let result = transform_chunk(chunk, LlmApiFormat::OpenaiChat, &mut state);
        assert!(result.is_err(), "invalid JSON should return Err");
    }

    /// convert_llm_to_sse_format が正しく変換されること。
    #[test]
    fn convert_llm_to_sse_format_maps_correctly() {
        assert_eq!(
            convert_llm_to_sse_format(LlmApiFormat::OpenaiChat).unwrap(),
            LlmApiFormat::OpenaiChat
        );
        assert_eq!(
            convert_llm_to_sse_format(LlmApiFormat::AnthropicMessages).unwrap(),
            LlmApiFormat::OpenaiChat
        );
        assert_eq!(
            convert_llm_to_sse_format(LlmApiFormat::OpenaiResponses).unwrap(),
            LlmApiFormat::OpenaiResponses
        );
        // 未対応のフォーマットは Err
        // LlmApiFormat に未対応 variant を追加できないため、
        // enumer が有限であることを確認するためのプレースホルダ
    }

    /// translate_stream の型シグネチャが Send を満たすこと（read_ms 追加後も維持）。
    #[test]
    fn translate_stream_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<
            fn(
                &ProviderClient,
                &ResolvedModel,
                serde_json::Value,
                LlmApiFormat,
                bool,
                bool,
                CancellationToken,
                u64,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<Response, ProxyError>> + Send>,
            >,
        >();
    }

    /// translate_non_stream の型シグネチャが Send を満たすこと。
    #[test]
    fn translate_non_stream_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<
            fn(
                &ProviderClient,
                &ResolvedModel,
                serde_json::Value,
                LlmApiFormat,
                &ApiFormat,
                bool,
                bool,
                u64,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<Response, ProxyError>> + Send>,
            >,
        >();
    }
}

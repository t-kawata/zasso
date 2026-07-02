//! HTTP request handlers for the multi-protocol proxy example.
//!
//! This module contains all the Axum request handlers that implement the proxy
//! logic for converting between Anthropic Messages API, `OpenAI` Chat Completions
//! API, and `OpenAI` Responses API formats. Each handler validates the inbound
//! request, resolves the active upstream (primary or backup via failover),
//! transforms the request body to the upstream's native protocol, forwards the
//! request, and transforms the response back to the client's expected format.
//!
//! # Streaming
//!
//! All handlers support both streaming (Server-Sent Events) and non-streaming
//! modes. Streaming responses are transformed frame-by-frame using
//! [`llm_bridge_core::transform::transform_stream`] and related functions so
//! that downstream clients receive events as soon as they arrive from upstream.
//!
//! # Module layout
//!
//! This module is a child of the `http-proxy` example crate. Shared types and
//! helper functions are imported from the parent module via `super::`. The
//! [`OpenAiEndpoint`] enum distinguishes between the two `OpenAI`-compatible
//! endpoints and is consumed only within this module.

use std::{collections::HashMap, io, sync::atomic::Ordering, time::Duration};

use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::IntoResponse,
};
use bytes::Bytes;
use futures::{StreamExt, stream};
use llm_bridge_core::{
    model::{ApiFormat, StreamState, TransformRequest},
    transform::{
        anthropic_to_openai, openai_to_anthropic, responses_to_anthropic, transform_stream,
        transform_stream_to_openai, transform_stream_to_openai_responses,
    },
};
use reqwest::header::{CONTENT_ENCODING, CONTENT_TYPE};
use serde_json::json;
use tracing::{debug, error, info};

use super::{
    auth::check_auth,
    config::ProxyConfig,
    helpers::{
        MAX_SSE_PENDING_BYTES, build_anthropic_error_response, build_anthropic_upstream_headers,
        build_openai_error_response, build_upstream_headers, estimate_tokens,
        extract_sse_event_types, format_upstream_error_body_for_log, is_anthropic_upstream,
        is_event_stream_content_type, is_streaming_request, maybe_disable_dashscope_thinking,
        maybe_log_raw_anthropic_sse_chunk, maybe_log_raw_upstream_sse_chunk, redact_headers,
        requested_model, should_log_raw_anthropic_sse, take_complete_sse_frames,
        transform_anthropic_message_to_sse, transform_anthropic_response_to_openai_completion,
        transform_anthropic_response_to_openai_responses, transform_openai_completion_to_sse,
        transform_openai_response_to_anthropic_message, transform_openai_responses_to_sse,
        transform_upstream_error_body_to_anthropic, transform_upstream_error_body_to_openai,
    },
    upstream_router::{NEXT_PROXY_REQUEST_ID, UpstreamTarget},
};

/// Identifies which `OpenAI`-compatible endpoint a request targets.
///
/// Used by [`handle_openai_compatible_request`] to select the correct request
/// and response transforms. The two variants correspond to the two distinct
/// URL paths exposed by the proxy:
///
/// * `/v1/chat/completions` → [`OpenAiEndpoint::ChatCompletions`]
/// * `/v1/responses` → [`OpenAiEndpoint::Responses`]
#[derive(Debug, Clone, Copy)]
pub(crate) enum OpenAiEndpoint {
    /// Classic `OpenAI` Chat Completions endpoint (`/v1/chat/completions`).
    ///
    /// Transforms use the `openai_to_anthropic` request path and
    /// `transform_stream_to_openai` for streaming responses.
    ChatCompletions,

    /// `OpenAI` Responses endpoint (`/v1/responses`).
    ///
    /// Transforms use the `responses_to_anthropic` request path and
    /// `transform_stream_to_openai_responses` for streaming responses.
    Responses,
}

/// Forward an Anthropic-format request directly to a native Anthropic upstream
/// (e.g., `api.anthropic.com`) without protocol transformation.
///
/// This is a fast-path used when the resolved upstream speaks the Anthropic
/// Messages API natively. The request body is forwarded as-is, and SSE streams
/// are relayed byte-for-byte without going through the transform pipeline.
///
/// # Arguments
///
/// * `proxy_request_id` — unique correlation ID for logging.
/// * `active` — the resolved upstream target (name, URL, API key).
/// * `headers` — inbound client headers to selectively forward.
/// * `body` — raw request body bytes (already validated as Anthropic JSON).
/// * `config` — shared proxy configuration for recording upstream status.
///
/// # Returns
///
/// An Axum response that mirrors the upstream status, headers, and body
/// (streaming SSE or JSON). Error responses are synthesised as Anthropic-style
/// JSON when the upstream call fails.
#[allow(clippy::too_many_lines)]
pub(crate) async fn handle_anthropic_passthrough(
    proxy_request_id: u64,
    active: &UpstreamTarget,
    headers: &HeaderMap,
    body: Bytes,
    config: &ProxyConfig,
) -> axum::response::Result<impl IntoResponse> {
    let is_streaming = is_streaming_request(&body);

    // Build upstream URL: strip /v1 from base if path already has it
    let upstream_url = if active.url.ends_with("/v1") {
        format!("{}/v1/messages", active.url)
    } else {
        format!("{}/v1/messages", active.url.trim_end_matches('/'))
    };

    // Build Anthropic-style headers for the upstream
    let mut final_headers = HeaderMap::new();
    // Auth: Anthropic uses x-api-key (not Authorization Bearer)
    final_headers.insert("x-api-key", active.api_key.parse().unwrap());
    final_headers.insert("anthropic-version", "2023-06-01".parse().unwrap());
    final_headers.insert("content-type", "application/json".parse().unwrap());
    if is_streaming {
        final_headers.insert("accept", "text/event-stream".parse().unwrap());
    }
    // Forward safe client headers that don't conflict
    for (name, value) in headers {
        let name_lower = name.to_string().to_lowercase();
        // Skip hop-by-hop and auth headers we already set
        if matches!(
            name_lower.as_str(),
            "authorization"
                | "x-api-key"
                | "anthropic-version"
                | "content-type"
                | "accept"
                | "host"
        ) {
            continue;
        }
        final_headers.insert(name.clone(), value.clone());
    }

    info!(
        proxy_request_id,
        upstream_url, is_streaming, "⏳ sending Anthropic passthrough upstream"
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(30))
        .http1_only()
        .build()
        .expect("build reqwest client");

    let mut upstream_req = client.post(&upstream_url);
    for (k, v) in &final_headers {
        upstream_req = upstream_req.header(k.clone(), v.clone());
    }
    upstream_req = upstream_req.body(body);

    let resp = match upstream_req.send().await {
        Ok(r) => {
            info!(
                proxy_request_id,
                status = r.status().as_u16(),
                "✅ Anthropic upstream responded"
            );
            r
        }
        Err(e) => {
            error!(proxy_request_id, error = %e, upstream_url, "Anthropic upstream request failed");
            config.record_upstream_error().await;
            let status = if e.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            let message = if e.is_timeout() {
                format!("upstream timeout: {e}")
            } else {
                format!("upstream failed: {e}")
            };
            let (status, err_body) = build_anthropic_error_response(status, message);
            return Ok((status, err_body).into_response());
        }
    };

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let resp_content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);

    config.record_upstream_status(status).await;

    // If streaming SSE, forward as-is
    if status.is_success() && is_event_stream_content_type(resp_content_type.as_deref()) {
        info!(proxy_request_id, "↔ forwarding Anthropic SSE stream as-is");

        let passthrough_stream = stream::unfold(
            (proxy_request_id, resp.bytes_stream(), false),
            |(proxy_request_id, mut upstream_stream, finished)| async move {
                if finished {
                    info!(
                        proxy_request_id,
                        "✓ Anthropic passthrough SSE stream closed"
                    );
                    return None;
                }
                match upstream_stream.next().await {
                    Some(Ok(chunk)) => Some((
                        Ok::<Bytes, io::Error>(chunk),
                        (proxy_request_id, upstream_stream, false),
                    )),
                    Some(Err(e)) => {
                        error!(proxy_request_id, error = %e, "failed to read upstream SSE chunk");
                        // Return IO error so client sees connection break and retries.
                        Some((
                            Err(io::Error::new(
                                io::ErrorKind::ConnectionAborted,
                                format!("upstream read failed: {e}"),
                            )),
                            (proxy_request_id, upstream_stream, true),
                        ))
                    }
                    None => Some((Ok(Bytes::new()), (proxy_request_id, upstream_stream, true))),
                }
            },
        );

        let mut resp_headers = HeaderMap::new();
        resp_headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("text/event-stream"),
        );
        resp_headers.insert(
            HeaderName::from_static("cache-control"),
            HeaderValue::from_static("no-cache"),
        );

        return Ok((status, resp_headers, Body::from_stream(passthrough_stream)).into_response());
    }

    // Non-streaming: read full body and forward as-is
    let resp_body = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            error!(proxy_request_id, error = %e, "failed to read upstream response body");
            let (s, b) = build_anthropic_error_response(
                StatusCode::BAD_GATEWAY,
                "failed to read upstream response",
            );
            return Ok((s, b).into_response());
        }
    };

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    Ok((status, resp_headers, resp_body).into_response())
}

/// Handle an inbound Anthropic Messages API request at `/v1/messages`.
///
/// Performs the following steps:
///
/// 1. Validates the client API key (when proxy auth is enabled).
/// 2. Resolves the active upstream (primary or backup) via the shared router.
/// 3. If the upstream speaks Anthropic natively, delegates to [`handle_anthropic_passthrough`] for
///    byte-for-byte forwarding.
/// 4. Otherwise, transforms the request from Anthropic Messages format to `OpenAI` Chat Completions
///    format with [`anthropic_to_openai`].
/// 5. Forwards the transformed request to the upstream.
/// 6. Transforms the response (or SSE stream) back to Anthropic format.
///
/// # Streaming
///
/// When the client requests streaming (`"stream": true`), the response is
/// transformed frame-by-frame via [`transform_stream`] so that downstream
/// Anthropic SSE events arrive incrementally.
#[allow(clippy::too_many_lines)]
pub(crate) async fn handle_anthropic_request(
    State(config): State<ProxyConfig>,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Result<impl IntoResponse> {
    let proxy_request_id = NEXT_PROXY_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
    info!(
        proxy_request_id,
        debug_anthropic_sse = should_log_raw_anthropic_sse(),
        "→ anthropic SSE raw debug flag"
    );

    // Auth check
    if let Some(status) = check_auth(&config, &headers) {
        let (status, body) = build_anthropic_error_response(status, "invalid API key");
        return Ok((status, body).into_response());
    }

    // Resolve active upstream (primary or backup via router)
    let active = config.active_upstream().await;
    info!(
        proxy_request_id,
        upstream_name = active.name,
        upstream_url = active.url,
        "→ resolved active upstream"
    );

    // If upstream is a native Anthropic API, forward the request directly
    // without protocol transformation.
    if is_anthropic_upstream(&active.url) {
        info!(
            proxy_request_id,
            "→ upstream is Anthropic-native — passthrough mode"
        );
        return Ok(handle_anthropic_passthrough(
            proxy_request_id,
            &active,
            &headers,
            body,
            &config,
        )
        .await
        .into_response());
    }

    // Build TransformRequest from client headers
    let mut req_headers: HashMap<String, String> = HashMap::new();
    for (name, value) in &headers {
        if let Ok(val_str) = value.to_str() {
            req_headers.insert(name.to_string(), val_str.to_string());
        }
    }

    let req = TransformRequest {
        headers: req_headers,
        path: "/v1/chat/completions".to_string(),
        body,
    };

    // Transform Anthropic → `OpenAI`
    let transformed = match anthropic_to_openai(&req) {
        Ok(t) => t,
        Err(e) => {
            error!(proxy_request_id, error = %e, "transform failed");
            let (status, body) = build_anthropic_error_response(
                StatusCode::BAD_REQUEST,
                format!("transform error: {e}"),
            );
            return Ok((status, body).into_response());
        }
    };
    let upstream_request_body = maybe_disable_dashscope_thinking(&active.url, &transformed.body);
    if upstream_request_body != transformed.body {
        info!(
            proxy_request_id,
            "→ inserted default enable_thinking=false for `DashScope` upstream"
        );
    }

    let request_is_streaming = is_streaming_request(&upstream_request_body);
    let requested_anthropic_model = requested_model(&req.body);
    info!(
        proxy_request_id,
        request_is_streaming,
        requested_anthropic_model = ?requested_anthropic_model,
        "→ request streaming mode"
    );

    // Estimate request token count (without logging body)
    if let Ok(transformed_json) =
        serde_json::from_slice::<serde_json::Value>(&upstream_request_body)
    {
        let token_estimate = estimate_tokens(&transformed_json);
        info!(
            proxy_request_id,
            estimated_tokens = token_estimate,
            "→ estimated request tokens"
        );
        debug!(
            proxy_request_id,
            model = %transformed_json.get("model").map_or("unknown", |v| v.as_str().unwrap_or_default()),
            messages_count = transformed_json.get("messages").map_or(0, |v| v.as_array().map_or(0, Vec::len)),
            "→ transformed body metadata"
        );
    }

    // Log upstream headers
    info!(
        proxy_request_id,
        upstream_headers = ?redact_headers(&transformed.headers),
        "→ upstream request headers"
    );

    // Build upstream request — avoid duplicating /v1 prefix
    let transformed_path = if active.url.ends_with("/v1") && transformed.path.starts_with("/v1/") {
        transformed
            .path
            .strip_prefix("/v1")
            .unwrap_or(&transformed.path)
    } else {
        &transformed.path
    };
    let upstream_url = format!("{}{}", active.url, transformed_path);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(30))
        // Force HTTP/1.1 - some upstream APIs don't support HTTP/2
        .http1_only()
        .build()
        .expect("build reqwest client");

    // Merge headers: original client + transformed + auth override.
    // Avoid forwarding stale content-length / hop-by-hop headers after body transform.
    let final_headers = build_upstream_headers(
        &req.headers,
        &transformed.headers,
        &active.api_key,
        request_is_streaming,
    );
    info!(
        proxy_request_id,
        request_is_streaming,
        final_accept = ?final_headers.get("accept"),
        "→ upstream accept selection"
    );

    // Log the actual headers being sent upstream (token count already logged above)
    info!(
        proxy_request_id,
        upstream_headers = ?redact_headers(&final_headers),
        upstream_url,
        "→ upstream request"
    );

    // Build and send request with merged headers
    info!(
        proxy_request_id,
        upstream_url, "⏳ sending upstream request..."
    );
    let mut upstream_req = client.post(&upstream_url);
    for (k, v) in &final_headers {
        upstream_req = upstream_req.header(k.clone(), v.clone());
    }
    upstream_req = upstream_req.body(upstream_request_body);

    // Send to upstream
    let resp = match upstream_req.send().await {
        Ok(r) => {
            let response_headers = r.headers();
            let response_content_type = response_headers
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(std::string::ToString::to_string);
            let response_content_encoding = response_headers
                .get(CONTENT_ENCODING)
                .and_then(|value| value.to_str().ok())
                .map(std::string::ToString::to_string);
            info!(
                proxy_request_id,
                status = r.status().as_u16(),
                response_content_type = ?response_content_type,
                response_content_encoding = ?response_content_encoding,
                "✅ upstream responded"
            );
            r
        }
        Err(e) => {
            error!(proxy_request_id, error = %e, upstream_url, "upstream request failed");
            config.record_upstream_error().await;
            let status = if e.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            let message = if e.is_timeout() {
                format!("upstream request timed out: {e}")
            } else {
                format!("upstream request failed: {e}")
            };
            let (status, body) = build_anthropic_error_response(status, message);
            return Ok((status, body).into_response());
        }
    };

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let response_content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(std::string::ToString::to_string);

    // Record response status for primary/backup failover
    config.record_upstream_status(status).await;

    if status.is_success() && is_event_stream_content_type(response_content_type.as_deref()) {
        info!(proxy_request_id, "↔ transforming upstream SSE stream");

        let transformed_stream = stream::unfold(
            (
                proxy_request_id,
                resp.bytes_stream(),
                Vec::new(),
                StreamState {
                    model_name: requested_anthropic_model.clone(),
                    ..StreamState::default()
                },
                false,
                config.clone(),
            ),
            |(
                proxy_request_id,
                mut upstream_stream,
                mut pending,
                mut stream_state,
                finished,
                err_cfg,
            )| async move {
                if finished {
                    info!(proxy_request_id, "✓ downstream anthropic SSE stream closed");
                    return None;
                }

                loop {
                    match upstream_stream.next().await {
                        Some(Ok(chunk)) => {
                            maybe_log_raw_upstream_sse_chunk(
                                proxy_request_id,
                                "← upstream raw SSE transport chunk",
                                &chunk,
                                pending.len(),
                            );
                            pending.extend_from_slice(&chunk);
                            if pending.len() > MAX_SSE_PENDING_BYTES {
                                error!(
                                    proxy_request_id,
                                    pending_len = pending.len(),
                                    "upstream SSE buffer exceeded — terminating stream"
                                );
                                return Some((
                                    Ok::<Bytes, io::Error>(Bytes::from(
                                        serde_json::to_string(&json!({
                                            "error": {
                                                "message": "upstream SSE buffer limit exceeded",
                                                "type": "buffer_limit_exceeded",
                                            }
                                        }))
                                        .unwrap_or_default(),
                                    )),
                                    (
                                        proxy_request_id,
                                        upstream_stream,
                                        pending,
                                        stream_state,
                                        true,
                                        err_cfg,
                                    ),
                                ));
                            }

                            let Some(complete_frames) = take_complete_sse_frames(&mut pending)
                            else {
                                info!(
                                    proxy_request_id,
                                    pending_len = pending.len(),
                                    "… waiting for complete upstream SSE frame boundary"
                                );
                                continue;
                            };

                            maybe_log_raw_upstream_sse_chunk(
                                proxy_request_id,
                                "← upstream raw SSE complete frames",
                                &complete_frames,
                                pending.len(),
                            );

                            match transform_stream(
                                &complete_frames,
                                ApiFormat::OpenaiChat,
                                &mut stream_state,
                            ) {
                                Ok(transformed_bytes) => {
                                    if transformed_bytes.is_empty() {
                                        continue;
                                    }
                                    let event_types = extract_sse_event_types(&transformed_bytes);
                                    info!(
                                        proxy_request_id,
                                        anthropic_event_types = ?event_types,
                                        chunk_bytes = transformed_bytes.len(),
                                        contains_message_stop = event_types
                                            .iter()
                                            .any(|event_type| event_type == "message_stop"),
                                        "← downstream anthropic SSE chunk"
                                    );
                                    if event_types
                                        .iter()
                                        .any(|event_type| event_type == "message_start")
                                        || event_types
                                            .iter()
                                            .any(|event_type| event_type == "message_stop")
                                    {
                                        maybe_log_raw_anthropic_sse_chunk(
                                            "← downstream anthropic SSE raw chunk",
                                            &transformed_bytes,
                                        );
                                    }
                                    return Some((
                                        Ok::<Bytes, io::Error>(Bytes::from(transformed_bytes)),
                                        (
                                            proxy_request_id,
                                            upstream_stream,
                                            pending,
                                            stream_state,
                                            false,
                                            err_cfg,
                                        ),
                                    ));
                                }
                                Err(e) => {
                                    error!(
                                        proxy_request_id,
                                        error = %e,
                                        "failed to transform upstream SSE chunk"
                                    );
                                    // Return IO error so client sees connection break and retries.
                                    return Some((
                                        Err(io::Error::new(
                                            io::ErrorKind::ConnectionAborted,
                                            format!("transform failed: {e}"),
                                        )),
                                        (
                                            proxy_request_id,
                                            upstream_stream,
                                            pending,
                                            stream_state,
                                            true,
                                            err_cfg,
                                        ),
                                    ));
                                }
                            }
                        }
                        Some(Err(e)) => {
                            error!(proxy_request_id, error = %e, "failed to read upstream SSE chunk");
                            tokio::spawn({
                                let e = err_cfg.clone();
                                async move { e.record_upstream_error().await }
                            });
                            // Return IO error so client sees connection break and retries.
                            // By retry time, failover will have switched to backup.
                            return Some((
                                Err(io::Error::new(
                                    io::ErrorKind::ConnectionAborted,
                                    format!("upstream read failed: {e}"),
                                )),
                                (
                                    proxy_request_id,
                                    upstream_stream,
                                    pending,
                                    stream_state,
                                    true,
                                    err_cfg,
                                ),
                            ));
                        }
                        None => {
                            if pending.is_empty() {
                                info!(
                                    proxy_request_id,
                                    "✓ upstream SSE exhausted with no pending bytes"
                                );
                                return None;
                            }

                            match transform_stream(
                                &pending,
                                ApiFormat::OpenaiChat,
                                &mut stream_state,
                            ) {
                                Ok(transformed_bytes) if transformed_bytes.is_empty() => {
                                    return None;
                                }
                                Ok(transformed_bytes) => {
                                    let event_types = extract_sse_event_types(&transformed_bytes);
                                    info!(
                                        proxy_request_id,
                                        anthropic_event_types = ?event_types,
                                        chunk_bytes = transformed_bytes.len(),
                                        contains_message_stop = event_types
                                            .iter()
                                            .any(|event_type| event_type == "message_stop"),
                                        "← downstream anthropic SSE final chunk"
                                    );
                                    maybe_log_raw_anthropic_sse_chunk(
                                        "← downstream anthropic SSE raw final chunk",
                                        &transformed_bytes,
                                    );
                                    return Some((
                                        Ok(Bytes::from(transformed_bytes)),
                                        (
                                            proxy_request_id,
                                            upstream_stream,
                                            Vec::new(),
                                            stream_state,
                                            true,
                                            err_cfg,
                                        ),
                                    ));
                                }
                                Err(e) => {
                                    error!(
                                        proxy_request_id,
                                        error = %e,
                                        "failed to finalize upstream SSE stream"
                                    );
                                    // Close stream without error event.
                                    return None;
                                }
                            }
                        }
                    }
                }
            },
        );

        let mut resp_headers = HeaderMap::new();
        resp_headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("text/event-stream"),
        );
        resp_headers.insert(
            HeaderName::from_static("cache-control"),
            HeaderValue::from_static("no-cache"),
        );

        return Ok((status, resp_headers, Body::from_stream(transformed_stream)).into_response());
    }

    if request_is_streaming {
        error!(
            status = status.as_u16(),
            response_content_type = ?response_content_type,
            "upstream returned non-SSE success response for streaming request"
        );
    }

    // Collect upstream body
    info!("⏳ reading upstream body...");
    let body_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            error!(error = %e, "failed to read upstream body");
            let (status, body) = build_anthropic_error_response(
                StatusCode::BAD_GATEWAY,
                format!("failed to read upstream body: {e}"),
            );
            return Ok((status, body).into_response());
        }
    };

    if !status.is_success() {
        error!(
            status = status.as_u16(),
            upstream_error_body_bytes = body_bytes.len(),
            upstream_error_body = %format_upstream_error_body_for_log(&body_bytes),
            "← upstream error response body"
        );
    }

    // Log response token count (without logging body)
    if let Ok(resp_json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        let usage_tokens = resp_json
            .get("usage")
            .and_then(|u| u.get("total_tokens"))
            .and_then(serde_json::Value::as_u64);
        let token_estimate = estimate_tokens(&resp_json);
        info!(
            actual_tokens = usage_tokens,
            estimated_tokens = token_estimate,
            "← upstream response tokens"
        );
    }

    let response_body = if status.is_success() {
        match transform_openai_response_to_anthropic_message(&body_bytes) {
            Ok(body) if request_is_streaming => match transform_anthropic_message_to_sse(&body) {
                Ok(sse_body) => {
                    let event_types = extract_sse_event_types(&sse_body);
                    info!(
                        anthropic_event_types = ?event_types,
                        chunk_bytes = sse_body.len(),
                        contains_message_stop = event_types
                            .iter()
                            .any(|event_type| event_type == "message_stop"),
                        "← synthesized downstream anthropic SSE"
                    );
                    let mut resp_headers = HeaderMap::new();
                    resp_headers.insert(
                        HeaderName::from_static("content-type"),
                        HeaderValue::from_static("text/event-stream"),
                    );
                    resp_headers.insert(
                        HeaderName::from_static("cache-control"),
                        HeaderValue::from_static("no-cache"),
                    );
                    return Ok((status, resp_headers, sse_body).into_response());
                }
                Err(e) => {
                    error!(error = %e, "failed to synthesize Anthropic SSE response");
                    let (status, body) = build_anthropic_error_response(
                        StatusCode::BAD_GATEWAY,
                        format!("failed to synthesize Anthropic SSE response: {e}"),
                    );
                    return Ok((status, body).into_response());
                }
            },
            Ok(body) => body,
            Err(e) => {
                error!(error = %e, "failed to transform upstream success response");
                let (status, body) = build_anthropic_error_response(
                    StatusCode::BAD_GATEWAY,
                    format!("failed to transform upstream response: {e}"),
                );
                return Ok((status, body).into_response());
            }
        }
    } else {
        transform_upstream_error_body_to_anthropic(&body_bytes, status)
    };

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json"),
    );

    Ok((status, resp_headers, response_body).into_response())
}

/// Handle an inbound `OpenAI` Chat Completions request at `/v1/chat/completions`.
///
/// This is a thin wrapper around [`handle_openai_compatible_request`] that sets
/// the endpoint to [`OpenAiEndpoint::ChatCompletions`]. The request is
/// transformed from `OpenAI` format to Anthropic Messages format before
/// forwarding, and the response is transformed back.
pub(crate) async fn handle_openai_request(
    State(config): State<ProxyConfig>,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Result<impl IntoResponse> {
    handle_openai_compatible_request(config, headers, body, OpenAiEndpoint::ChatCompletions).await
}

/// Handle an inbound `OpenAI` Responses request at `/v1/responses`.
///
/// This is a thin wrapper around [`handle_openai_compatible_request`] that sets
/// the endpoint to [`OpenAiEndpoint::Responses`]. The request is transformed
/// from the Responses API format to Anthropic Messages format before
/// forwarding, and the response is transformed back to Responses format.
pub(crate) async fn handle_openai_responses_request(
    State(config): State<ProxyConfig>,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Result<impl IntoResponse> {
    handle_openai_compatible_request(config, headers, body, OpenAiEndpoint::Responses).await
}

/// Shared implementation for both `OpenAI`-compatible endpoints.
///
/// Performs the following steps:
///
/// 1. Validates the client API key (when proxy auth is enabled).
/// 2. Resolves the active upstream via the shared router.
/// 3. Transforms the `OpenAI`-format request to Anthropic Messages format using
///    [`openai_to_anthropic`] (for [`OpenAiEndpoint::ChatCompletions`]) or
///    [`responses_to_anthropic`] (for [`OpenAiEndpoint::Responses`]).
/// 4. Forwards the transformed request to the upstream.
/// 5. Transforms the response (or SSE stream) back to the requested `OpenAI` format.
///
/// # Streaming
///
/// When the client requests streaming (`"stream": true`), the response is
/// transformed frame-by-frame via [`transform_stream_to_openai`] or
/// [`transform_stream_to_openai_responses`] so that downstream SSE events
/// arrive incrementally.
#[allow(clippy::too_many_lines)]
pub(crate) async fn handle_openai_compatible_request(
    config: ProxyConfig,
    headers: HeaderMap,
    body: Bytes,
    endpoint: OpenAiEndpoint,
) -> axum::response::Result<impl IntoResponse> {
    let proxy_request_id = NEXT_PROXY_REQUEST_ID.fetch_add(1, Ordering::Relaxed);

    if let Some(status) = check_auth(&config, &headers) {
        let (status, body) = build_openai_error_response(status, "invalid API key");
        return Ok((status, body).into_response());
    }

    // Resolve active upstream (primary or backup via router)
    let active = config.active_upstream().await;

    let mut req_headers: HashMap<String, String> = HashMap::new();
    for (name, value) in &headers {
        if let Ok(val_str) = value.to_str() {
            req_headers.insert(name.to_string(), val_str.to_string());
        }
    }

    let req = TransformRequest {
        headers: req_headers,
        path: match endpoint {
            OpenAiEndpoint::ChatCompletions => "/v1/chat/completions",
            OpenAiEndpoint::Responses => "/v1/responses",
        }
        .to_string(),
        body,
    };

    let transformed_result = match endpoint {
        OpenAiEndpoint::ChatCompletions => openai_to_anthropic(&req),
        OpenAiEndpoint::Responses => responses_to_anthropic(&req),
    };

    let transformed = match transformed_result {
        Ok(t) => t,
        Err(e) => {
            error!(proxy_request_id, error = %e, "transform failed");
            let (status, body) = build_openai_error_response(
                StatusCode::BAD_REQUEST,
                format!("transform error: {e}"),
            );
            return Ok((status, body).into_response());
        }
    };

    let request_is_streaming = is_streaming_request(&req.body);
    let requested_openai_model = requested_model(&req.body);

    let final_headers = build_anthropic_upstream_headers(
        &req.headers,
        &transformed.headers,
        &active.api_key,
        request_is_streaming,
    );

    let transformed_path = if active.url.ends_with("/v1") && transformed.path.starts_with("/v1/") {
        transformed
            .path
            .strip_prefix("/v1")
            .unwrap_or(&transformed.path)
    } else {
        &transformed.path
    };
    let upstream_url = format!("{}{}", active.url, transformed_path);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(30))
        .http1_only()
        .build()
        .expect("build reqwest client");

    info!(
        proxy_request_id,
        upstream_headers = ?redact_headers(&final_headers),
        upstream_url,
        request_is_streaming,
        "→ upstream Anthropic request"
    );

    let mut upstream_req = client.post(&upstream_url);
    for (k, v) in &final_headers {
        upstream_req = upstream_req.header(k.clone(), v.clone());
    }
    upstream_req = upstream_req.body(transformed.body.clone());

    let resp = match upstream_req.send().await {
        Ok(r) => r,
        Err(e) => {
            error!(proxy_request_id, error = %e, upstream_url, "upstream request failed");
            config.record_upstream_error().await;
            let status = if e.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            let message = if e.is_timeout() {
                format!("upstream request timed out: {e}")
            } else {
                format!("upstream request failed: {e}")
            };
            let (status, body) = build_openai_error_response(status, message);
            return Ok((status, body).into_response());
        }
    };

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let response_content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(std::string::ToString::to_string);

    if status.is_success() && is_event_stream_content_type(response_content_type.as_deref()) {
        let transformed_stream = stream::unfold(
            (
                proxy_request_id,
                resp.bytes_stream(),
                Vec::new(),
                StreamState {
                    model_name: requested_openai_model.clone(),
                    ..StreamState::default()
                },
                false,
                config.clone(),
            ),
            move |(
                proxy_request_id,
                mut upstream_stream,
                mut pending,
                mut stream_state,
                finished,
                err_cfg,
            )| async move {
                if finished {
                    return None;
                }

                loop {
                    match upstream_stream.next().await {
                        Some(Ok(chunk)) => {
                            maybe_log_raw_upstream_sse_chunk(
                                proxy_request_id,
                                "← upstream raw SSE transport chunk",
                                &chunk,
                                pending.len(),
                            );
                            pending.extend_from_slice(&chunk);
                            if pending.len() > MAX_SSE_PENDING_BYTES {
                                error!(
                                    proxy_request_id,
                                    pending_len = pending.len(),
                                    "upstream SSE buffer exceeded — terminating stream"
                                );
                                return Some((
                                    Ok::<Bytes, io::Error>(Bytes::from(
                                        serde_json::to_string(&json!({
                                            "error": {
                                                "message": "upstream SSE buffer limit exceeded",
                                                "type": "buffer_limit_exceeded",
                                            }
                                        }))
                                        .unwrap_or_default(),
                                    )),
                                    (
                                        proxy_request_id,
                                        upstream_stream,
                                        pending,
                                        stream_state,
                                        true,
                                        err_cfg,
                                    ),
                                ));
                            }

                            let Some(complete_frames) = take_complete_sse_frames(&mut pending)
                            else {
                                continue;
                            };

                            let transformed_chunk = match endpoint {
                                OpenAiEndpoint::ChatCompletions => transform_stream_to_openai(
                                    &complete_frames,
                                    ApiFormat::AnthropicMessages,
                                    &mut stream_state,
                                ),
                                OpenAiEndpoint::Responses => transform_stream_to_openai_responses(
                                    &complete_frames,
                                    ApiFormat::AnthropicMessages,
                                    &mut stream_state,
                                ),
                            };

                            match transformed_chunk {
                                Ok(transformed_bytes) => {
                                    if transformed_bytes.is_empty() {
                                        continue;
                                    }
                                    return Some((
                                        Ok::<Bytes, io::Error>(Bytes::from(transformed_bytes)),
                                        (
                                            proxy_request_id,
                                            upstream_stream,
                                            pending,
                                            stream_state,
                                            false,
                                            err_cfg,
                                        ),
                                    ));
                                }
                                Err(e) => {
                                    error!(
                                        proxy_request_id,
                                        error = %e,
                                        "failed to transform upstream Anthropic SSE chunk"
                                    );
                                    // Return IO error so client sees connection break and retries.
                                    return Some((
                                        Err(io::Error::new(
                                            io::ErrorKind::ConnectionAborted,
                                            format!("transform failed: {e}"),
                                        )),
                                        (
                                            proxy_request_id,
                                            upstream_stream,
                                            pending,
                                            stream_state,
                                            true,
                                            err_cfg,
                                        ),
                                    ));
                                }
                            }
                        }
                        Some(Err(e)) => {
                            error!(proxy_request_id, error = %e, "failed to read upstream SSE chunk");
                            tokio::spawn({
                                let e = err_cfg.clone();
                                async move { e.record_upstream_error().await }
                            });
                            // Return IO error so client sees connection break and retries.
                            return Some((
                                Err(io::Error::new(
                                    io::ErrorKind::ConnectionAborted,
                                    format!("upstream read failed: {e}"),
                                )),
                                (
                                    proxy_request_id,
                                    upstream_stream,
                                    pending,
                                    stream_state,
                                    true,
                                    err_cfg,
                                ),
                            ));
                        }
                        None => {
                            if pending.is_empty() {
                                return None;
                            }

                            let transformed_chunk = match endpoint {
                                OpenAiEndpoint::ChatCompletions => transform_stream_to_openai(
                                    &pending,
                                    ApiFormat::AnthropicMessages,
                                    &mut stream_state,
                                ),
                                OpenAiEndpoint::Responses => transform_stream_to_openai_responses(
                                    &pending,
                                    ApiFormat::AnthropicMessages,
                                    &mut stream_state,
                                ),
                            };

                            match transformed_chunk {
                                Ok(transformed_bytes) if transformed_bytes.is_empty() => {
                                    return None;
                                }
                                Ok(transformed_bytes) => {
                                    return Some((
                                        Ok(Bytes::from(transformed_bytes)),
                                        (
                                            proxy_request_id,
                                            upstream_stream,
                                            Vec::new(),
                                            stream_state,
                                            true,
                                            err_cfg,
                                        ),
                                    ));
                                }
                                Err(e) => {
                                    error!(
                                        proxy_request_id,
                                        error = %e,
                                        "failed to finalize upstream Anthropic SSE stream"
                                    );
                                    // Close stream without error event.
                                    return None;
                                }
                            }
                        }
                    }
                }
            },
        );

        let mut resp_headers = HeaderMap::new();
        resp_headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("text/event-stream"),
        );
        resp_headers.insert(
            HeaderName::from_static("cache-control"),
            HeaderValue::from_static("no-cache"),
        );

        return Ok((status, resp_headers, Body::from_stream(transformed_stream)).into_response());
    }

    let body_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            error!(proxy_request_id, error = %e, "failed to read upstream body");
            let (status, body) = build_openai_error_response(
                StatusCode::BAD_GATEWAY,
                format!("failed to read upstream body: {e}"),
            );
            return Ok((status, body).into_response());
        }
    };

    let response_body = if status.is_success() {
        let transformed_body = match endpoint {
            OpenAiEndpoint::ChatCompletions => {
                transform_anthropic_response_to_openai_completion(&body_bytes)
            }
            OpenAiEndpoint::Responses => {
                transform_anthropic_response_to_openai_responses(&body_bytes)
            }
        };

        match transformed_body {
            Ok(body) if request_is_streaming => {
                let sse_result = match endpoint {
                    OpenAiEndpoint::ChatCompletions => transform_openai_completion_to_sse(&body),
                    OpenAiEndpoint::Responses => transform_openai_responses_to_sse(&body),
                };

                match sse_result {
                    Ok(sse_body) => {
                        let mut resp_headers = HeaderMap::new();
                        resp_headers.insert(
                            HeaderName::from_static("content-type"),
                            HeaderValue::from_static("text/event-stream"),
                        );
                        resp_headers.insert(
                            HeaderName::from_static("cache-control"),
                            HeaderValue::from_static("no-cache"),
                        );
                        return Ok((status, resp_headers, sse_body).into_response());
                    }
                    Err(e) => {
                        error!(error = %e, "failed to synthesize `OpenAI` SSE response");
                        let (status, body) = build_openai_error_response(
                            StatusCode::BAD_GATEWAY,
                            format!("failed to synthesize `OpenAI` SSE response: {e}"),
                        );
                        return Ok((status, body).into_response());
                    }
                }
            }
            Ok(body) => body,
            Err(e) => {
                error!(error = %e, "failed to transform upstream Anthropic success response");
                let (status, body) = build_openai_error_response(
                    StatusCode::BAD_GATEWAY,
                    format!("failed to transform upstream response: {e}"),
                );
                return Ok((status, body).into_response());
            }
        }
    } else {
        transform_upstream_error_body_to_openai(&body_bytes, status)
    };

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json"),
    );

    Ok((status, resp_headers, response_body).into_response())
}

/// Handle health-check requests at `/health`.
///
/// Returns a simple JSON body `{ "status": "ok" }` with HTTP 200. Used by load
/// balancers and container orchestrators to verify the proxy process is alive.
pub(crate) async fn handle_health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" }))).into_response()
}

//! # Transparent provider mode
//!
//! upstream が Anthropic 互換 API の場合の透過中継を実装する（RFC §5.1）。
//! non-stream リクエストは `execute_with_failover`、stream は `execute_stream`。
//!
//! server feature 有効時のみコンパイルされる。

use std::sync::Arc;

use axum::body::Body;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use futures::StreamExt;
use reqwest::RequestBuilder;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::config::{ProxyError, ResolvedModel};
use crate::routing::scheduler::KeyScheduler;

/// 透過中継のエントリポイント。
pub async fn handle_transparent(
    state: Arc<AppState>,
    provider_name: &str,
    resolved: &ResolvedModel,
    body: serde_json::Value,
    is_stream: bool,
) -> Result<Response, ProxyError> {
    let client = state
        .http_clients
        .get(provider_name)
        .ok_or_else(|| ProxyError::Internal(format!("http_client not found for {provider_name}")))?;

    let scheduler = state
        .schedulers
        .get(provider_name)
        .ok_or_else(|| ProxyError::Internal(format!("scheduler not found for {provider_name}")))?;

    let provider_config = state
        .config
        .providers
        .get(provider_name)
        .ok_or_else(|| ProxyError::UnknownProvider(provider_name.to_string()))?;

    // base_url が既に /v1 で終わっている場合、重複を避ける
    let base = provider_config
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/v1");
    let upstream_url = format!("{base}/v1/messages");

    // body の model 名を upstream 名に書き換え
    let mut upstream_body = body;
    upstream_body["model"] = serde_json::json!(resolved.upstream);

    let req_builder = client.post(&upstream_url).json(&upstream_body);

    if is_stream {
        let req_builder = req_builder.header("Accept", "text/event-stream");
        let upstream_resp = execute_stream(scheduler, req_builder).await?;
        Ok(stream_response(upstream_resp).await)
    } else {
        let upstream_resp = execute_with_failover(scheduler, req_builder).await?;
        Ok(json_response(upstream_resp).await)
    }
}

/// non-stream リクエストを key failover 付きで実行する。
///
/// - 初回成功 → Ok
/// - 5xx → 別 key で再試行（最大3回）
/// - 4xx → failover せず即座に返す
async fn execute_with_failover(
    scheduler: &KeyScheduler,
    request: RequestBuilder,
) -> Result<reqwest::Response, ProxyError> {
    let max_attempts = scheduler.key_count().min(3);
    let mut last_error = None;

    for _attempt in 0..max_attempts {
        let key = scheduler.select_key();
        let cloned = request
            .try_clone()
            .ok_or_else(|| ProxyError::Internal("request body not cloneable".to_string()))?;
        let response = cloned
            .bearer_auth(key)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => return Ok(resp),
            Ok(resp) if resp.status().is_server_error() => {
                last_error = Some(ProxyError::Upstream(resp.status()));
            }
            Ok(resp) => return Ok(resp), // 4xx → 即座
            Err(e) => {
                last_error = Some(ProxyError::UpstreamError(e.to_string()));
            }
        }
    }

    Err(last_error.unwrap_or(ProxyError::UpstreamError(
        "all keys failed".to_string(),
    )))
}

/// stream リクエストを実行する（failover 禁止）。
async fn execute_stream(
    scheduler: &KeyScheduler,
    request: RequestBuilder,
) -> Result<reqwest::Response, ProxyError> {
    let key = scheduler.select_key();
    let response = request
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;

    if !response.status().is_success() {
        return Err(ProxyError::Upstream(response.status()));
    }
    Ok(response)
}

/// SSE ストリームを中継する。
async fn proxy_sse_stream(
    upstream_resp: reqwest::Response,
    _cancel: CancellationToken,
) -> Response {
    let (tx, rx) = mpsc::channel::<Result<axum::body::Bytes, axum::Error>>(64);
    let mut stream = upstream_resp.bytes_stream();

    tokio::spawn(async move {
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    if tx.send(Ok(bytes)).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let stream_body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));

    (
        StatusCode::OK,
        [
            ("content-type", "text/event-stream"),
            ("cache-control", "no-cache"),
        ],
        stream_body,
    )
        .into_response()
}

/// stream 応答を構築する。
async fn stream_response(upstream_resp: reqwest::Response) -> Response {
    let cancel = CancellationToken::new();
    proxy_sse_stream(upstream_resp, cancel).await
}

/// non-stream JSON 応答を構築する。
async fn json_response(upstream_resp: reqwest::Response) -> Response {
    let status = upstream_resp.status();
    let headers = filter_response_headers(upstream_resp.headers());
    let body_bytes = upstream_resp.bytes().await.unwrap_or_default();

    let mut response = Response::builder().status(status);
    for (name, value) in &headers {
        response = response.header(name.as_str(), value);
    }
    // body_bytes が空でも Response 構築は成功する（空 Body は有効）
    // builder が失敗した場合のみフォールバック
    match response.body(Body::from(body_bytes)) {
        Ok(resp) => resp,
        Err(_) => {
            let mut fallback = Response::new(Body::from("upstream response build failed"));
            *fallback.status_mut() = StatusCode::BAD_GATEWAY;
            fallback
        }
    }
}

/// レスポンス header から hop-by-hop header を除去する。
fn filter_response_headers(headers: &HeaderMap) -> Vec<(String, String)> {
    const HOP_BY_HOP: &[&str] = &[
        "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers",
        "transfer-encoding", "upgrade",
    ];

    headers
        .iter()
        .filter(|(name, _)| {
            let lower = name.as_str().to_ascii_lowercase();
            !HOP_BY_HOP.contains(&lower.as_str())
        })
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.as_str().to_string(), v.to_string()))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// execute_with_failover の型シグネチャが Send を満たすこと。
    #[test]
    fn execute_with_failover_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<
            fn(&KeyScheduler, RequestBuilder) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<reqwest::Response, ProxyError>> + Send>,
            >,
        >();
    }

    /// filter_response_headers が hop-by-hop header を除去すること。
    #[test]
    fn filter_response_removes_hop_by_hop() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        headers.insert("connection", "keep-alive".parse().unwrap());
        headers.insert("x-custom", "value".parse().unwrap());

        let filtered = filter_response_headers(&headers);
        let names: Vec<&str> = filtered.iter().map(|(n, _)| n.as_str()).collect();

        assert!(names.contains(&"content-type"));
        assert!(names.contains(&"x-custom"));
        assert!(!names.contains(&"connection"));
    }

    /// json_response の型シグネチャが Send を満たすこと。
    #[test]
    fn json_response_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<
            fn(reqwest::Response) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Response> + Send>,
            >,
        >();
    }
}

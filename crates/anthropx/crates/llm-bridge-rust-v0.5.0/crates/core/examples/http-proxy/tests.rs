#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        convert::Infallible,
        sync::mpsc::{self, Receiver, Sender},
        time::Duration,
    };

    use axum::{
        Json, Router,
        body::Body,
        extract::State,
        http::{HeaderMap, HeaderValue, StatusCode},
        response::IntoResponse,
        routing::post,
    };
    use bytes::{Buf, Bytes};
    use futures::stream;
    use http_body_util::BodyExt;
    use reqwest::header::CONTENT_TYPE;
    use serde_json::json;

    use super::{
        ActiveRoute, COOLDOWN_SECONDS, MAX_LOGGED_UPSTREAM_ERROR_BODY_BYTES, ProxyConfig,
        REDACTED_HEADER_VALUE, SYNTHETIC_THINKING_SIGNATURE, UpstreamRouter, UpstreamTarget,
        anthropic_request_has_thinking, build_anthropic_error_response,
        build_anthropic_upstream_headers, build_openai_error_response, build_upstream_headers,
        format_upstream_error_body_for_log, handle_anthropic_passthrough, handle_anthropic_request,
        handle_openai_request, handle_openai_responses_request, is_anthropic_upstream,
        is_dashscope_upstream, map_http_status_to_anthropic_error_type,
        maybe_disable_dashscope_thinking, redact_headers, transform_anthropic_message_to_sse,
        transform_anthropic_response_to_openai_completion,
        transform_anthropic_response_to_openai_responses, transform_openai_completion_to_sse,
        transform_openai_response_to_anthropic_message, transform_openai_responses_to_sse,
        transform_upstream_error_body_to_anthropic, transform_upstream_error_body_to_openai,
    };

    #[derive(Debug)]
    struct CapturedRequest {
        headers: HashMap<String, String>,
        body: Bytes,
    }

    fn mock_openai_text_response() -> serde_json::Value {
        json!({
            "id": "chatcmpl-proxy-test",
            "object": "chat.completion",
            "model": "qwen3.6-plus",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello from upstream"
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 4,
                "total_tokens": 14
            }
        })
    }

    fn mock_anthropic_text_response() -> serde_json::Value {
        json!({
            "id": "msg-proxy-test",
            "type": "message",
            "role": "assistant",
            "model": "qwen-plus-anthropic",
            "content": [{
                "type": "text",
                "text": "Hello from Anthropic upstream"
            }],
            "stop_reason": "end_turn",
            "stop_sequence": null,
            "usage": {
                "input_tokens": 10,
                "output_tokens": 4
            }
        })
    }

    async fn mock_upstream_handler(
        State(sender): State<Sender<CapturedRequest>>,
        headers: HeaderMap,
        body: Bytes,
    ) -> impl IntoResponse {
        let captured_headers = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|header_value| (name.to_string(), header_value.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let _ = sender.send(CapturedRequest {
            headers: captured_headers,
            body,
        });

        (StatusCode::OK, Json(mock_openai_text_response()))
    }

    async fn mock_anthropic_upstream_handler(
        State(sender): State<Sender<CapturedRequest>>,
        headers: HeaderMap,
        body: Bytes,
    ) -> impl IntoResponse {
        let captured_headers = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|header_value| (name.to_string(), header_value.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let _ = sender.send(CapturedRequest {
            headers: captured_headers,
            body,
        });

        (StatusCode::OK, Json(mock_anthropic_text_response()))
    }

    async fn mock_json_for_streaming_upstream_handler(
        State(sender): State<Sender<CapturedRequest>>,
        headers: HeaderMap,
        body: Bytes,
    ) -> impl IntoResponse {
        let captured_headers = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|header_value| (name.to_string(), header_value.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let _ = sender.send(CapturedRequest {
            headers: captured_headers,
            body,
        });

        (StatusCode::OK, Json(mock_openai_text_response()))
    }

    async fn mock_streaming_upstream_handler(
        State(sender): State<Sender<CapturedRequest>>,
        headers: HeaderMap,
        body: Bytes,
    ) -> impl IntoResponse {
        let captured_headers = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|header_value| (name.to_string(), header_value.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let _ = sender.send(CapturedRequest {
            headers: captured_headers,
            body,
        });

        let raw_openai_sse = vec![
            Ok::<Bytes, Infallible>(Bytes::from_static(
                b"data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"Hel\"}}]}\n",
            )),
            Ok(Bytes::from_static(b"\n")),
            Ok(Bytes::from_static(
                b"data: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n",
            )),
        ];

        let mut response_headers = HeaderMap::new();
        response_headers.insert(CONTENT_TYPE, HeaderValue::from_static("text/event-stream"));

        (
            StatusCode::OK,
            response_headers,
            Body::from_stream(stream::iter(raw_openai_sse)),
        )
    }

    async fn mock_anthropic_json_for_streaming_upstream_handler(
        State(sender): State<Sender<CapturedRequest>>,
        headers: HeaderMap,
        body: Bytes,
    ) -> impl IntoResponse {
        let captured_headers = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|header_value| (name.to_string(), header_value.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let _ = sender.send(CapturedRequest {
            headers: captured_headers,
            body,
        });

        (StatusCode::OK, Json(mock_anthropic_text_response()))
    }

    async fn mock_anthropic_streaming_upstream_handler(
        State(sender): State<Sender<CapturedRequest>>,
        headers: HeaderMap,
        body: Bytes,
    ) -> impl IntoResponse {
        let captured_headers = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|header_value| (name.to_string(), header_value.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let _ = sender.send(CapturedRequest {
            headers: captured_headers,
            body,
        });

        let raw_anthropic_sse = vec![
            Ok::<Bytes, Infallible>(Bytes::from_static(
                b"event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-stream\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"qwen-plus-anthropic\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":10,\"output_tokens\":0}}}\n\n",
            )),
            Ok(Bytes::from_static(
                b"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            )),
            Ok(Bytes::from_static(
                b"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hel\"}}\n\n",
            )),
            Ok(Bytes::from_static(
                b"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"lo\"}}\n\n",
            )),
            Ok(Bytes::from_static(
                b"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            )),
            Ok(Bytes::from_static(
                b"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}\n\n",
            )),
            Ok(Bytes::from_static(
                b"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
            )),
        ];

        let mut response_headers = HeaderMap::new();
        response_headers.insert(CONTENT_TYPE, HeaderValue::from_static("text/event-stream"));

        (
            StatusCode::OK,
            response_headers,
            Body::from_stream(stream::iter(raw_anthropic_sse)),
        )
    }

    async fn spawn_mock_upstream() -> (
        String,
        Receiver<CapturedRequest>,
        tokio::task::JoinHandle<()>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let app = Router::new()
            .route("/v1/chat/completions", post(mock_upstream_handler))
            .with_state(sender);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock upstream should bind");
        let addr = listener
            .local_addr()
            .expect("mock upstream should have local addr");
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock upstream should serve successfully");
        });

        (format!("http://{addr}"), receiver, join_handle)
    }

    async fn spawn_mock_anthropic_upstream() -> (
        String,
        Receiver<CapturedRequest>,
        tokio::task::JoinHandle<()>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let app = Router::new()
            .route("/v1/messages", post(mock_anthropic_upstream_handler))
            .with_state(sender);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock anthropic upstream should bind");
        let addr = listener
            .local_addr()
            .expect("mock anthropic upstream should have local addr");
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock anthropic upstream should serve successfully");
        });

        (format!("http://{addr}"), receiver, join_handle)
    }

    async fn spawn_mock_streaming_upstream() -> (
        String,
        Receiver<CapturedRequest>,
        tokio::task::JoinHandle<()>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let app = Router::new()
            .route(
                "/v1/chat/completions",
                post(mock_streaming_upstream_handler),
            )
            .with_state(sender);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock streaming upstream should bind");
        let addr = listener
            .local_addr()
            .expect("mock streaming upstream should have local addr");
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock streaming upstream should serve successfully");
        });

        (format!("http://{addr}"), receiver, join_handle)
    }

    async fn spawn_mock_json_for_streaming_upstream() -> (
        String,
        Receiver<CapturedRequest>,
        tokio::task::JoinHandle<()>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let app = Router::new()
            .route(
                "/v1/chat/completions",
                post(mock_json_for_streaming_upstream_handler),
            )
            .with_state(sender);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock json-for-streaming upstream should bind");
        let addr = listener
            .local_addr()
            .expect("mock json-for-streaming upstream should have local addr");
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock json-for-streaming upstream should serve successfully");
        });

        (format!("http://{addr}"), receiver, join_handle)
    }

    async fn spawn_mock_anthropic_streaming_upstream() -> (
        String,
        Receiver<CapturedRequest>,
        tokio::task::JoinHandle<()>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let app = Router::new()
            .route(
                "/v1/messages",
                post(mock_anthropic_streaming_upstream_handler),
            )
            .with_state(sender);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock anthropic streaming upstream should bind");
        let addr = listener
            .local_addr()
            .expect("mock anthropic streaming upstream should have local addr");
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock anthropic streaming upstream should serve successfully");
        });

        (format!("http://{addr}"), receiver, join_handle)
    }

    async fn spawn_mock_anthropic_json_for_streaming_upstream() -> (
        String,
        Receiver<CapturedRequest>,
        tokio::task::JoinHandle<()>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let app = Router::new()
            .route(
                "/v1/messages",
                post(mock_anthropic_json_for_streaming_upstream_handler),
            )
            .with_state(sender);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock anthropic json-for-streaming upstream should bind");
        let addr = listener
            .local_addr()
            .expect("mock anthropic json-for-streaming upstream should have local addr");
        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock anthropic json-for-streaming upstream should serve successfully");
        });

        (format!("http://{addr}"), receiver, join_handle)
    }

    #[test]
    fn test_should_not_forward_stale_content_length_or_client_auth() {
        let client_headers = HashMap::from([
            ("content-length".to_string(), "999".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
            ("accept-encoding".to_string(), "gzip, br".to_string()),
            ("authorization".to_string(), "Bearer client-key".to_string()),
            ("x-api-key".to_string(), "proxy-key".to_string()),
            ("user-agent".to_string(), "curl/8.7.1".to_string()),
        ]);
        let transformed_headers = HashMap::from([
            (
                "authorization".to_string(),
                "Bearer transformed-key".to_string(),
            ),
            ("content-type".to_string(), "application/json".to_string()),
        ]);

        let upstream_headers =
            build_upstream_headers(&client_headers, &transformed_headers, "upstream-key", false);

        assert_eq!(upstream_headers.get("content-length"), None);
        assert_eq!(upstream_headers.get("accept-encoding"), None);
        assert_eq!(upstream_headers.get("authorization"), None);
        assert_eq!(upstream_headers.get("x-api-key"), None);
        assert_eq!(
            upstream_headers.get("Authorization"),
            Some(&"Bearer upstream-key".to_string())
        );
        assert_eq!(
            upstream_headers.get("content-type"),
            Some(&"application/json".to_string())
        );
        assert_eq!(
            upstream_headers.get("user-agent"),
            Some(&"curl/8.7.1".to_string())
        );
    }

    #[test]
    fn test_should_force_event_stream_accept_header_for_streaming_requests() {
        let client_headers = HashMap::from([
            ("accept".to_string(), "application/json".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]);
        let transformed_headers =
            HashMap::from([("content-type".to_string(), "application/json".to_string())]);

        let upstream_headers =
            build_upstream_headers(&client_headers, &transformed_headers, "upstream-key", true);

        assert_eq!(
            upstream_headers.get("accept"),
            Some(&"text/event-stream".to_string())
        );
        assert_eq!(
            upstream_headers.get("Authorization"),
            Some(&"Bearer upstream-key".to_string())
        );
    }

    #[test]
    fn test_should_redact_sensitive_headers_in_logs() {
        let headers = HashMap::from([
            (
                "authorization".to_string(),
                "Bearer secret-value".to_string(),
            ),
            ("x-api-key".to_string(), "proxy-secret".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]);

        let redacted = redact_headers(&headers);

        assert_eq!(
            redacted.get("authorization"),
            Some(&REDACTED_HEADER_VALUE.to_string())
        );
        assert_eq!(
            redacted.get("x-api-key"),
            Some(&REDACTED_HEADER_VALUE.to_string())
        );
        assert_eq!(
            redacted.get("content-type"),
            Some(&"application/json".to_string())
        );
    }

    #[test]
    fn test_should_truncate_logged_upstream_error_body() {
        let body = Bytes::from(vec![b'a'; MAX_LOGGED_UPSTREAM_ERROR_BODY_BYTES + 5]);

        let logged = format_upstream_error_body_for_log(&body);

        assert!(logged.starts_with(&"a".repeat(MAX_LOGGED_UPSTREAM_ERROR_BODY_BYTES)));
        assert!(logged.ends_with("… <truncated 5 bytes>"));
    }

    #[test]
    fn test_should_transform_openai_tool_calls_into_anthropic_tool_use_blocks() {
        let openai_response = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "chatcmpl-tool-call",
                "object": "chat.completion",
                "model": "qwen3.6-plus",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Let me check that.",
                        "tool_calls": [{
                            "id": "call_weather_123",
                            "type": "function",
                            "function": {
                                "name": "get_weather",
                                "arguments": "{\"city\":\"Paris\"}"
                            }
                        }]
                    },
                    "finish_reason": "tool_calls"
                }],
                "usage": {
                    "prompt_tokens": 20,
                    "completion_tokens": 6,
                    "total_tokens": 26
                }
            }))
            .expect("mock `OpenAI` tool-call response should serialize"),
        );

        let anthropic_response = transform_openai_response_to_anthropic_message(&openai_response)
            .expect("`OpenAI` response should transform into Anthropic response");
        let response_json: serde_json::Value = serde_json::from_slice(&anthropic_response)
            .expect("Anthropic response should be valid json");

        assert_eq!(response_json["type"], "message");
        assert_eq!(response_json["role"], "assistant");
        assert_eq!(response_json["content"][0]["type"], "text");
        assert_eq!(response_json["content"][0]["text"], "Let me check that.");
        assert_eq!(response_json["content"][1]["type"], "tool_use");
        assert_eq!(response_json["content"][1]["id"], "call_weather_123");
        assert_eq!(response_json["content"][1]["name"], "get_weather");
        assert_eq!(response_json["content"][1]["input"]["city"], "Paris");
        assert_eq!(response_json["stop_reason"], "tool_use");
        assert_eq!(response_json["usage"]["input_tokens"], 20);
        assert_eq!(response_json["usage"]["output_tokens"], 6);
    }

    #[test]
    fn test_should_transform_openai_reasoning_content_into_anthropic_thinking_blocks() {
        let openai_response = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "chatcmpl-thinking",
                "object": "chat.completion",
                "model": "qwen3.6-plus",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "reasoning_content": "First I inspect the route.",
                        "content": "The route is missing."
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 24,
                    "completion_tokens": 10,
                    "total_tokens": 34
                }
            }))
            .expect("mock `OpenAI` thinking response should serialize"),
        );

        let anthropic_response = transform_openai_response_to_anthropic_message(&openai_response)
            .expect("`OpenAI` response should transform into Anthropic response");
        let response_json: serde_json::Value = serde_json::from_slice(&anthropic_response)
            .expect("Anthropic response should be valid json");

        assert_eq!(response_json["content"][0]["type"], "thinking");
        assert_eq!(
            response_json["content"][0]["thinking"],
            "First I inspect the route."
        );
        assert_eq!(
            response_json["content"][0]["signature"],
            SYNTHETIC_THINKING_SIGNATURE
        );
        assert_eq!(response_json["content"][1]["type"], "text");
        assert_eq!(response_json["content"][1]["text"], "The route is missing.");
        assert_eq!(response_json["stop_reason"], "end_turn");
    }

    #[test]
    fn test_should_transform_anthropic_thinking_message_to_sse() {
        let anthropic_message = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg-thinking",
                "type": "message",
                "role": "assistant",
                "model": "qwen3.6-plus",
                "content": [
                    {
                        "type": "thinking",
                        "thinking": "Let me reason this through.",
                        "signature": SYNTHETIC_THINKING_SIGNATURE
                    },
                    {
                        "type": "text",
                        "text": "Done."
                    }
                ],
                "stop_reason": "end_turn",
                "stop_sequence": null,
                "usage": {
                    "input_tokens": 12,
                    "output_tokens": 5
                }
            }))
            .expect("Anthropic message should serialize"),
        );

        let sse = transform_anthropic_message_to_sse(&anthropic_message)
            .expect("Anthropic message should convert to SSE");
        let sse_text = String::from_utf8(sse.to_vec()).expect("SSE should be valid UTF-8");

        assert!(sse_text.contains("\"type\":\"thinking_delta\""));
        assert!(sse_text.contains("\"thinking\":\"Let me reason this through.\""));
        assert!(sse_text.contains("\"type\":\"signature_delta\""));
        assert!(sse_text.contains(SYNTHETIC_THINKING_SIGNATURE));
        assert!(sse_text.contains("\"type\":\"text_delta\""));
        assert!(sse_text.contains("\"text\":\"Done.\""));
    }

    #[test]
    fn test_should_transform_anthropic_response_into_openai_completion() {
        let anthropic_response = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg-openai",
                "type": "message",
                "role": "assistant",
                "model": "qwen-plus-anthropic",
                "content": [
                    {
                        "type": "thinking",
                        "thinking": "Let me inspect the route.",
                        "signature": SYNTHETIC_THINKING_SIGNATURE
                    },
                    {
                        "type": "text",
                        "text": "The route exists."
                    },
                    {
                        "type": "tool_use",
                        "id": "toolu_123",
                        "name": "codegraph_search",
                        "input": { "query": "sso google login" }
                    }
                ],
                "stop_reason": "tool_use",
                "stop_sequence": null,
                "usage": {
                    "input_tokens": 12,
                    "output_tokens": 5
                }
            }))
            .expect("Anthropic response should serialize"),
        );

        let openai_response =
            transform_anthropic_response_to_openai_completion(&anthropic_response)
                .expect("Anthropic response should transform into `OpenAI` completion");
        let response_json: serde_json::Value = serde_json::from_slice(&openai_response)
            .expect("`OpenAI` completion should be valid json");

        assert_eq!(
            response_json["choices"][0]["message"]["reasoning_content"],
            "Let me inspect the route."
        );
        assert_eq!(
            response_json["choices"][0]["message"]["content"],
            "The route exists."
        );
        assert_eq!(
            response_json["choices"][0]["message"]["tool_calls"][0]["id"],
            "toolu_123"
        );
        assert_eq!(response_json["choices"][0]["finish_reason"], "tool_calls");
        assert_eq!(response_json["usage"]["total_tokens"], 17);
    }

    #[test]
    fn test_should_synthesize_openai_sse_from_openai_completion() {
        let openai_response = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "chatcmpl-stream",
                "object": "chat.completion",
                "model": "qwen3.6-plus",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "reasoning_content": "Let me think.",
                        "content": "Done.",
                        "tool_calls": [{
                            "id": "toolu_123",
                            "type": "function",
                            "function": {
                                "name": "get_weather",
                                "arguments": "{\"city\":\"Paris\"}"
                            }
                        }]
                    },
                    "finish_reason": "tool_calls"
                }],
                "usage": {
                    "prompt_tokens": 12,
                    "completion_tokens": 5,
                    "total_tokens": 17
                }
            }))
            .expect("`OpenAI` response should serialize"),
        );

        let sse = transform_openai_completion_to_sse(&openai_response)
            .expect("`OpenAI` completion should convert to SSE");
        let sse_text = String::from_utf8(sse.to_vec()).expect("SSE should be valid UTF-8");

        assert!(sse_text.contains("\"role\":\"assistant\""));
        assert!(sse_text.contains("\"reasoning_content\":\"Let me think.\""));
        assert!(sse_text.contains("\"content\":\"Done.\""));
        assert!(sse_text.contains("\"tool_calls\""));
        assert!(sse_text.contains("\"finish_reason\":\"tool_calls\""));
        assert!(sse_text.contains("data: [DONE]"));
    }

    #[test]
    fn test_should_transform_anthropic_response_into_openai_responses_body() {
        let anthropic_response = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg-resp-proxy-test",
                "type": "message",
                "role": "assistant",
                "model": "qwen3.6-plus",
                "content": [
                    {
                        "type": "thinking",
                        "thinking": "Need to inspect the project tree.",
                        "signature": SYNTHETIC_THINKING_SIGNATURE
                    },
                    {
                        "type": "text",
                        "text": "The route exists."
                    },
                    {
                        "type": "tool_use",
                        "id": "toolu_123",
                        "name": "find_route",
                        "input": {"path": "/v1/responses"}
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {
                    "input_tokens": 12,
                    "output_tokens": 5
                }
            }))
            .expect("Anthropic response should serialize"),
        );

        let responses_body = transform_anthropic_response_to_openai_responses(&anthropic_response)
            .expect("Anthropic response should transform into Responses body");
        let response_json: serde_json::Value =
            serde_json::from_slice(&responses_body).expect("Responses body should be valid json");

        assert_eq!(response_json["object"], "response");
        assert_eq!(response_json["output_text"], "The route exists.");
        assert_eq!(
            response_json["output"][0]["content"][0]["type"],
            "reasoning_text"
        );
        assert_eq!(
            response_json["output"][1]["content"][0]["type"],
            "output_text"
        );
        assert_eq!(response_json["output"][2]["type"], "function_call");
    }

    #[test]
    fn test_should_synthesize_openai_responses_sse_from_openai_responses_body() {
        let responses_body = Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp-stream",
                "object": "response",
                "created_at": 1,
                "status": "completed",
                "model": "qwen3.6-plus",
                "output": [
                    {
                        "id": "resp-stream_item_0",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{
                            "type": "reasoning_text",
                            "text": "Need to inspect the code path."
                        }]
                    },
                    {
                        "id": "resp-stream_item_1",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{
                            "type": "output_text",
                            "text": "Done.",
                            "annotations": []
                        }]
                    },
                    {
                        "id": "fc_resp-stream_2",
                        "type": "function_call",
                        "call_id": "toolu_123",
                        "name": "find_route",
                        "arguments": "{\"path\":\"/v1/responses\"}",
                        "status": "completed"
                    }
                ],
                "output_text": "Done.",
                "usage": {
                    "input_tokens": 12,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens": 5,
                    "output_tokens_details": {"reasoning_tokens": 0},
                    "total_tokens": 17
                }
            }))
            .expect("Responses body should serialize"),
        );

        let sse = transform_openai_responses_to_sse(&responses_body)
            .expect("Responses body should convert to SSE");
        let sse_text = String::from_utf8(sse.to_vec()).expect("SSE should be valid UTF-8");

        assert!(sse_text.contains("\"type\":\"response.created\""));
        assert!(sse_text.contains("\"type\":\"response.reasoning_text.delta\""));
        assert!(sse_text.contains("\"type\":\"response.output_text.delta\""));
        assert!(sse_text.contains("\"type\":\"response.function_call_arguments.delta\""));
        assert!(sse_text.contains("\"type\":\"response.completed\""));
        assert!(sse_text.contains("data: [DONE]"));
    }

    #[tokio::test]
    async fn test_should_rebuild_upstream_request_when_client_content_length_is_stale() {
        let (upstream_url, receiver, join_handle) = spawn_mock_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 32,
                "messages": [{
                    "role": "user",
                    "content": [{"type": "text", "text": "Hello from the proxy test"}]
                }]
            }))
            .expect("request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert("content-length", HeaderValue::from_static("999"));
        headers.insert(
            "accept-encoding",
            HeaderValue::from_static("gzip, deflate, br, zstd"),
        );
        headers.insert("x-api-key", HeaderValue::from_static("client-proxy-key"));
        headers.insert("user-agent", HeaderValue::from_static("test-client"));

        let response = handle_anthropic_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a response")
            .into_response();
        let status = response.status();
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock upstream should receive a request");

        join_handle.abort();
        let _ = join_handle.await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&response_bytes)
                .expect("proxy response should be valid json"),
            json!({
                "id": "chatcmpl-proxy-test",
                "type": "message",
                "role": "assistant",
                "model": "qwen3.6-plus",
                "content": [{
                    "type": "text",
                    "text": "Hello from upstream"
                }],
                "stop_reason": "end_turn",
                "stop_sequence": null,
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 4
                }
            })
        );
        assert_ne!(
            upstream_request.headers.get("content-length"),
            Some(&"999".to_string())
        );
        assert_eq!(upstream_request.headers.get("accept-encoding"), None);
        assert_eq!(
            upstream_request.headers.get("content-length"),
            Some(&upstream_request.body.len().to_string())
        );
        assert_eq!(
            upstream_request.headers.get("authorization"),
            Some(&"Bearer upstream-secret".to_string())
        );
        assert_eq!(
            upstream_request.headers.get("user-agent"),
            Some(&"test-client".to_string())
        );
    }

    #[test]
    fn test_should_detect_dashscope_upstream() {
        assert!(is_dashscope_upstream(
            "https://coding.dashscope.aliyuncs.com/v1/chat/completions"
        ));
        assert!(!is_dashscope_upstream(
            "http://127.0.0.1:18080/v1/chat/completions"
        ));
    }

    #[test]
    fn test_should_detect_anthropic_upstream() {
        assert!(is_anthropic_upstream("https://api.anthropic.com/v1"));
        assert!(is_anthropic_upstream(
            "https://api.anthropic.com/v1/messages"
        ));
        assert!(!is_anthropic_upstream(
            "https://coding.dashscope.aliyuncs.com/v1"
        ));
        assert!(!is_anthropic_upstream("http://127.0.0.1:8080/v1"));
    }

    #[test]
    fn test_should_disable_dashscope_thinking_by_default() {
        let openai_body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "stream": true,
                "messages": [{"role": "user", "content": "Hello"}]
            }))
            .expect("`OpenAI` request body should serialize"),
        );

        let result = maybe_disable_dashscope_thinking(
            "https://coding.dashscope.aliyuncs.com/v1",
            &openai_body,
        );
        let result_json: serde_json::Value =
            serde_json::from_slice(&result).expect("result body should remain valid json");

        assert_eq!(
            result_json["enable_thinking"],
            serde_json::Value::Bool(false)
        );
    }

    #[test]
    fn test_should_preserve_explicit_dashscope_thinking_setting() {
        let anthropic_body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "thinking": {"type": "enabled", "budget_tokens": 1024},
                "messages": [{
                    "role": "user",
                    "content": [{"type": "text", "text": "Think carefully"}]
                }]
            }))
            .expect("Anthropic request body should serialize"),
        );
        let openai_body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "enable_thinking": true,
                "messages": [{"role": "user", "content": "Think carefully"}]
            }))
            .expect("`OpenAI` request body should serialize"),
        );

        assert!(anthropic_request_has_thinking(&anthropic_body));

        let result = maybe_disable_dashscope_thinking(
            "https://coding.dashscope.aliyuncs.com/v1",
            &openai_body,
        );
        let result_json: serde_json::Value =
            serde_json::from_slice(&result).expect("result body should remain valid json");

        assert_eq!(
            result_json["enable_thinking"],
            serde_json::Value::Bool(true)
        );
    }

    #[tokio::test]
    async fn test_should_transform_openai_sse_into_anthropic_event_stream() {
        let (upstream_url, receiver, join_handle) = spawn_mock_streaming_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 32,
                "stream": true,
                "messages": [{
                    "role": "user",
                    "content": [{"type": "text", "text": "Stream hello"}]
                }]
            }))
            .expect("streaming request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert("x-api-key", HeaderValue::from_static("client-proxy-key"));
        headers.insert("user-agent", HeaderValue::from_static("test-client"));

        let response = handle_anthropic_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a streaming response")
            .into_response();
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy streaming response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock upstream should receive a streaming request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_text = String::from_utf8(response_bytes.to_vec())
            .expect("Anthropic SSE response should be valid utf-8");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
        assert!(response_text.contains("event: message_start"));
        assert!(response_text.contains("event: content_block_start"));
        assert!(response_text.contains("event: content_block_delta"));
        assert!(response_text.contains("\"text\":\"Hel\""));
        assert!(response_text.contains("\"text\":\"lo\""));
        assert!(response_text.contains("\"model\":\"claude-sonnet-4-20250514\""));
        assert!(response_text.contains("event: message_delta"));
        assert!(response_text.contains("\"stop_reason\":\"end_turn\""));
        assert!(response_text.contains("\"usage\":{\"output_tokens\":"));
        assert!(response_text.contains("event: message_stop"));
        assert_eq!(
            upstream_request.headers.get("authorization"),
            Some(&"Bearer upstream-secret".to_string())
        );
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");
        assert_eq!(upstream_body["stream"], serde_json::Value::Bool(true));
    }

    #[tokio::test]
    async fn test_should_synthesize_sse_when_streaming_request_gets_json_response() {
        let (upstream_url, receiver, join_handle) = spawn_mock_json_for_streaming_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 32,
                "stream": true,
                "messages": [{
                    "role": "user",
                    "content": [{"type": "text", "text": "Stream hello"}]
                }]
            }))
            .expect("streaming request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert("x-api-key", HeaderValue::from_static("client-proxy-key"));
        headers.insert("user-agent", HeaderValue::from_static("test-client"));

        let response = handle_anthropic_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a synthesized streaming response")
            .into_response();
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy synthesized streaming response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock upstream should receive a streaming request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_text = String::from_utf8(response_bytes.to_vec())
            .expect("Anthropic SSE response should be valid utf-8");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
        assert!(response_text.contains("event: message_start"));
        assert!(response_text.contains("event: content_block_start"));
        assert!(response_text.contains("event: content_block_delta"));
        assert!(response_text.contains("Hello from upstream"));
        assert!(response_text.contains("event: message_delta"));
        assert!(response_text.contains("\"stop_reason\":\"end_turn\""));
        assert!(response_text.contains("event: message_stop"));
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");
        assert_eq!(upstream_body["stream"], serde_json::Value::Bool(true));
    }

    #[tokio::test]
    async fn test_should_proxy_openai_request_to_anthropic_upstream() {
        let (upstream_url, receiver, join_handle) = spawn_mock_anthropic_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "messages": [{
                    "role": "user",
                    "content": "Hello from `OpenAI` client"
                }]
            }))
            .expect("`OpenAI` request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer client-openai-key"),
        );

        let response = handle_openai_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a response")
            .into_response();
        let status = response.status();
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock anthropic upstream should receive a request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_json: serde_json::Value =
            serde_json::from_slice(&response_bytes).expect("proxy response should be valid json");
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(response_json["object"], "chat.completion");
        assert_eq!(
            response_json["choices"][0]["message"]["content"],
            "Hello from Anthropic upstream"
        );
        assert_eq!(response_json["choices"][0]["finish_reason"], "stop");
        assert_eq!(
            upstream_request.headers.get("x-api-key"),
            Some(&"upstream-secret".to_string())
        );
        assert_eq!(upstream_request.headers.get("authorization"), None);
        assert_eq!(upstream_body["messages"][0]["role"], "user");
        assert_eq!(
            upstream_body["messages"][0]["content"][0]["text"],
            "Hello from `OpenAI` client"
        );
    }

    #[tokio::test]
    async fn test_should_transform_anthropic_sse_into_openai_event_stream() {
        let (upstream_url, receiver, join_handle) = spawn_mock_anthropic_streaming_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "stream": true,
                "messages": [{
                    "role": "user",
                    "content": "Stream hello"
                }]
            }))
            .expect("streaming `OpenAI` request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer client-openai-key"),
        );

        let response = handle_openai_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a streaming response")
            .into_response();
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy streaming response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock anthropic upstream should receive a request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_text = String::from_utf8(response_bytes.to_vec())
            .expect("`OpenAI` SSE response should be valid utf-8");
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
        assert!(response_text.contains("\"role\":\"assistant\""));
        assert!(response_text.contains("\"content\":\"Hel\""));
        assert!(response_text.contains("\"content\":\"lo\""));
        assert!(response_text.contains("\"finish_reason\":\"stop\""));
        assert!(response_text.contains("data: [DONE]"));
        assert_eq!(
            upstream_request.headers.get("x-api-key"),
            Some(&"upstream-secret".to_string())
        );
        assert_eq!(upstream_body["stream"], serde_json::Value::Bool(true));
    }

    #[tokio::test]
    async fn test_should_synthesize_openai_sse_when_streaming_request_gets_anthropic_json_response()
    {
        let (upstream_url, receiver, join_handle) =
            spawn_mock_anthropic_json_for_streaming_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "stream": true,
                "messages": [{
                    "role": "user",
                    "content": "Stream hello"
                }]
            }))
            .expect("streaming `OpenAI` request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer client-openai-key"),
        );

        let response = handle_openai_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a synthesized streaming response")
            .into_response();
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy synthesized streaming response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock anthropic upstream should receive a request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_text = String::from_utf8(response_bytes.to_vec())
            .expect("`OpenAI` SSE response should be valid utf-8");
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
        assert!(response_text.contains("\"role\":\"assistant\""));
        assert!(response_text.contains("Hello from Anthropic upstream"));
        assert!(response_text.contains("\"finish_reason\":\"stop\""));
        assert!(response_text.contains("data: [DONE]"));
        assert_eq!(upstream_body["stream"], serde_json::Value::Bool(true));
    }

    #[tokio::test]
    async fn test_should_transform_anthropic_response_into_openai_responses_proxy_response() {
        let (upstream_url, receiver, join_handle) = spawn_mock_anthropic_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "instructions": "You are helpful.",
                "input": "Hello from `OpenAI` Responses client"
            }))
            .expect("request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer client-openai-key"),
        );

        let response = handle_openai_responses_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a response")
            .into_response();
        let status = response.status();
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock anthropic upstream should receive a request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_json: serde_json::Value =
            serde_json::from_slice(&response_bytes).expect("proxy response should be valid json");
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(response_json["object"], "response");
        assert_eq!(
            response_json["output_text"],
            "Hello from Anthropic upstream"
        );
        assert_eq!(
            response_json["output"][0]["content"][0]["type"],
            "output_text"
        );
        assert_eq!(upstream_body["system"], "You are helpful.");
        assert_eq!(
            upstream_body["messages"][0]["content"][0]["text"],
            "Hello from `OpenAI` Responses client"
        );
    }

    #[tokio::test]
    async fn test_should_transform_anthropic_sse_into_openai_responses_event_stream() {
        let (upstream_url, receiver, join_handle) = spawn_mock_anthropic_streaming_upstream().await;
        let config = ProxyConfig {
            upstream_url,
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };
        let body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "stream": true,
                "input": "Stream hello"
            }))
            .expect("streaming Responses request body should serialize"),
        );
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer client-openai-key"),
        );

        let response = handle_openai_responses_request(State(config), headers, body)
            .await
            .expect("proxy handler should return a streaming response")
            .into_response();
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let response_bytes = response
            .into_body()
            .collect()
            .await
            .expect("proxy streaming response body should be readable")
            .to_bytes();
        let upstream_request = receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("mock anthropic upstream should receive a request");

        join_handle.abort();
        let _ = join_handle.await;

        let response_text = String::from_utf8(response_bytes.to_vec())
            .expect("Responses SSE response should be valid utf-8");
        let upstream_body: serde_json::Value = serde_json::from_slice(&upstream_request.body)
            .expect("upstream request body should be valid json");

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
        assert!(response_text.contains("\"type\":\"response.created\""));
        assert!(response_text.contains("\"type\":\"response.output_text.delta\""));
        assert!(response_text.contains("\"type\":\"response.completed\""));
        assert!(response_text.contains("data: [DONE]"));
        assert_eq!(upstream_body["stream"], serde_json::Value::Bool(true));
    }

    #[test]
    fn test_should_map_http_status_to_anthropic_error_type() {
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::BAD_REQUEST),
            "invalid_request_error"
        );
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::UNAUTHORIZED),
            "authentication_error"
        );
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::GATEWAY_TIMEOUT),
            "timeout_error"
        );
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::TOO_MANY_REQUESTS),
            "rate_limit_error"
        );
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::INTERNAL_SERVER_ERROR),
            "api_error"
        );
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::BAD_GATEWAY),
            "api_error"
        );
        assert_eq!(
            map_http_status_to_anthropic_error_type(StatusCode::SERVICE_UNAVAILABLE),
            "api_error"
        );
    }

    #[test]
    fn test_should_build_anthropic_error_response() {
        let (status, Json(body)) =
            build_anthropic_error_response(StatusCode::UNAUTHORIZED, "invalid API key");
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["type"], "error");
        assert_eq!(body["error"]["type"], "authentication_error");
        assert_eq!(body["error"]["message"], "invalid API key");
    }

    #[test]
    fn test_should_build_openai_error_response() {
        let (status, Json(body)) =
            build_openai_error_response(StatusCode::UNAUTHORIZED, "invalid API key");
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"]["type"], "authentication_error");
        assert_eq!(body["error"]["message"], "invalid API key");
        assert_eq!(body["error"]["code"], serde_json::Value::Null);
    }

    #[test]
    fn test_should_transform_openai_error_body_to_anthropic() {
        let openai_error = Bytes::from(
            serde_json::to_vec(&json!({
                "error": {
                    "code": "invalid_parameter_error",
                    "message": "The content field is a required field.",
                    "type": "invalid_request_error"
                }
            }))
            .unwrap(),
        );
        let result =
            transform_upstream_error_body_to_anthropic(&openai_error, StatusCode::BAD_REQUEST);
        let result_json: serde_json::Value = serde_json::from_slice(&result).unwrap();

        assert_eq!(result_json["type"], "error");
        assert_eq!(result_json["error"]["type"], "invalid_request_error");
        assert_eq!(
            result_json["error"]["message"],
            "The content field is a required field."
        );
    }

    #[test]
    fn test_should_transform_non_json_error_body_to_anthropic() {
        let plain_text_error = Bytes::from("something went wrong");
        let result =
            transform_upstream_error_body_to_anthropic(&plain_text_error, StatusCode::BAD_GATEWAY);
        let result_json: serde_json::Value = serde_json::from_slice(&result).unwrap();

        assert_eq!(result_json["type"], "error");
        assert_eq!(result_json["error"]["type"], "api_error");
        assert_eq!(result_json["error"]["message"], "something went wrong");
    }

    #[test]
    fn test_should_transform_anthropic_error_body_to_openai() {
        let anthropic_error = Bytes::from(
            serde_json::to_vec(&json!({
                "type": "error",
                "error": {
                    "type": "invalid_request_error",
                    "message": "max_tokens is required"
                }
            }))
            .unwrap(),
        );
        let result =
            transform_upstream_error_body_to_openai(&anthropic_error, StatusCode::BAD_REQUEST);
        let result_json: serde_json::Value = serde_json::from_slice(&result).unwrap();

        assert_eq!(result_json["error"]["type"], "invalid_request_error");
        assert_eq!(result_json["error"]["message"], "max_tokens is required");
        assert_eq!(result_json["error"]["code"], serde_json::Value::Null);
    }

    #[test]
    fn test_should_build_anthropic_upstream_headers_without_authorization() {
        let client_headers = HashMap::from([
            ("authorization".to_string(), "Bearer client-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
            ("user-agent".to_string(), "test-client".to_string()),
        ]);
        let transformed_headers = HashMap::from([
            ("x-api-key".to_string(), "client-derived-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]);

        let result = build_anthropic_upstream_headers(
            &client_headers,
            &transformed_headers,
            "upstream-secret",
            true,
        );

        assert_eq!(
            result.get("x-api-key"),
            Some(&"upstream-secret".to_string())
        );
        assert_eq!(result.get("authorization"), None);
        assert_eq!(result.get("accept"), Some(&"text/event-stream".to_string()));
        assert_eq!(result.get("user-agent"), Some(&"test-client".to_string()));
    }

    // -----------------------------------------------------------------------
    // Upstream Router tests
    // -----------------------------------------------------------------------

    fn make_primary_target() -> UpstreamTarget {
        UpstreamTarget {
            name: "primary".to_string(),
            url: "http://127.0.0.1:8001/v1".to_string(),
            api_key: "pk-primary".to_string(),
        }
    }

    fn make_backup_target() -> UpstreamTarget {
        UpstreamTarget {
            name: "backup".to_string(),
            url: "http://127.0.0.1:8002/v1".to_string(),
            api_key: "pk-backup".to_string(),
        }
    }

    #[test]
    fn test_router_defaults_to_primary() {
        let primary = make_primary_target();
        let router = UpstreamRouter::new(primary.clone(), None);

        assert_eq!(router.active, ActiveRoute::Primary);
        let target = router.active_target();
        assert_eq!(target.url, primary.url);
        assert_eq!(target.api_key, primary.api_key);
    }

    #[test]
    fn test_router_with_backup_defaults_to_primary() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        assert_eq!(router.active, ActiveRoute::Primary);
        let target = router.active_target();
        assert_eq!(target.url, primary.url);
    }

    #[test]
    fn test_router_fails_over_to_backup_on_429() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let mut router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);

        assert_eq!(router.active, ActiveRoute::Backup);
        let target = router.active_target();
        assert_eq!(target.url, backup.url);
        assert_eq!(target.api_key, backup.api_key);
    }

    #[test]
    fn test_router_no_failover_without_backup() {
        let primary = make_primary_target();
        let mut router = UpstreamRouter::new(primary.clone(), None);

        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);

        assert_eq!(router.active, ActiveRoute::Primary);
    }

    #[test]
    fn test_router_non_429_does_not_trigger_failover() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let mut router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        router.record_response_status(StatusCode::INTERNAL_SERVER_ERROR);

        assert_eq!(router.active, ActiveRoute::Primary);
    }

    #[test]
    fn test_router_fails_back_to_primary_on_health_recovery() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let mut router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        // Trigger failover
        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(router.active, ActiveRoute::Backup);
        assert!(router.cooldown_remaining > 0);

        // Health check passing during cooldown should NOT fail back yet
        router.mark_primary_healthy();
        assert_eq!(router.active, ActiveRoute::Backup); // still on backup

        // Simulate cooldown period elapsing
        for _ in 0..COOLDOWN_SECONDS {
            router.tick_cooldown();
        }
        assert_eq!(router.cooldown_remaining, 0);

        // Now health check passing should fail back to primary
        router.mark_primary_healthy();
        assert_eq!(router.active, ActiveRoute::Primary);
        assert!(router.primary_healthy);
    }

    #[test]
    fn test_router_cooldown_prevents_premature_failback() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let mut router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        // Trigger failover
        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(router.active, ActiveRoute::Backup);
        let initial_cooldown = router.cooldown_remaining;

        // Multiple health checks during cooldown should not fail back
        for _ in 0..5 {
            router.mark_primary_healthy();
            assert_eq!(router.active, ActiveRoute::Backup);
            router.tick_cooldown();
        }
        assert!(router.cooldown_remaining < initial_cooldown);
    }

    #[test]
    fn test_router_health_check_failure_keeps_on_backup() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let mut router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        // Trigger failover
        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(router.active, ActiveRoute::Backup);

        // Simulate health check still failing
        router.mark_primary_unhealthy();

        assert_eq!(router.active, ActiveRoute::Backup);
        assert!(!router.primary_healthy);
    }

    #[test]
    fn test_router_already_on_backup_does_not_switch_again_on_429() {
        let primary = make_primary_target();
        let backup = make_backup_target();
        let mut router = UpstreamRouter::new(primary.clone(), Some(backup.clone()));

        // First 429 triggers failover
        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(router.active, ActiveRoute::Backup);

        // Another 429 should not change anything
        router.record_response_status(StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(router.active, ActiveRoute::Backup);
    }

    #[tokio::test]
    async fn test_should_passthrough_to_anthropic_upstream_without_transform() {
        let (upstream_url, receiver, join_handle) = spawn_mock_anthropic_upstream().await;
        let config = ProxyConfig {
            upstream_url: upstream_url.clone(),
            upstream_api_key: "upstream-secret".to_string(),
            proxy_api_key: None,
            router: None,
        };

        let anthropic_body = Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": "Hello"}]
            }))
            .unwrap(),
        );

        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_str("test-key").unwrap());
        headers.insert(
            "content-type",
            HeaderValue::from_str("application/json").unwrap(),
        );

        // Call passthrough directly (since is_anthropic_upstream requires api.anthropic.com)
        let active = UpstreamTarget {
            name: "primary".to_string(),
            url: upstream_url,
            api_key: "upstream-secret".to_string(),
        };
        let response =
            handle_anthropic_passthrough(42, &active, &headers, anthropic_body.clone(), &config)
                .await;

        let captured = receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("upstream should receive a request");

        // In passthrough mode the body is forwarded as-is, not transformed to `OpenAI`.
        let received_body: serde_json::Value =
            serde_json::from_slice(&captured.body).expect("body should be valid JSON");

        // Anthropic fields should be preserved (not converted to `OpenAI` equivalents)
        assert_eq!(
            received_body["max_tokens"], 1024,
            "body should keep max_tokens (Anthropic field)"
        );
        assert!(
            received_body.get("messages").is_some(),
            "body should have messages array"
        );

        // Verify x-api-key header was set to upstream key
        assert_eq!(
            captured.headers.get("x-api-key"),
            Some(&"upstream-secret".to_string()),
            "upstream should receive x-api-key header"
        );

        let (_, resp_body) = response.into_response().into_parts();
        let resp_bytes = resp_body
            .collect()
            .await
            .expect("response body should be readable")
            .aggregate();
        let resp_json: serde_json::Value =
            serde_json::from_reader(resp_bytes.reader()).expect("response should be valid JSON");

        // Anthropic response format: should have "type", "content", "role" fields
        assert_eq!(
            resp_json["type"], "message",
            "response should be in Anthropic format"
        );
        assert_eq!(resp_json["role"], "assistant");

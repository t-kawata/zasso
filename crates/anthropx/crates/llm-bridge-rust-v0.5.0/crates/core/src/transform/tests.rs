//! Tests for protocol transform functions.

use std::{collections::HashMap, env};

use bytes::Bytes;
use serde::Deserialize;
use serde_json::json;

use super::*;
use crate::model::{TransformError, TransformRequest, TransformResponse};

// ---------------------------------------------------------------------------
// Anthropic → OpenAI tests
// ---------------------------------------------------------------------------

#[test]
fn test_anthropic_to_openai_basic() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 256,
                "system": "You are a concise assistant.",
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Say hello in one sentence."}]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();

    assert_eq!(
        result.headers.get("authorization"),
        Some(&"Bearer test-key".to_string())
    );
    assert_eq!(result.path, "/v1/chat/completions");

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    assert_eq!(out_body["model"], "claude-sonnet-4-20250514");
    assert_eq!(out_body["messages"][0]["role"], "system");
    assert_eq!(out_body["messages"][1]["role"], "user");
    assert_eq!(
        out_body["messages"][1]["content"],
        "Say hello in one sentence."
    );
}

#[test]
fn test_anthropic_to_openai_system_as_array() {
    // Claude Code sends system as an array of content blocks (newer API format)
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 256,
                "system": [
                    { "type": "text", "text": "You are a helpful assistant." },
                    { "type": "text", "text": "Keep responses concise." }
                ],
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Hi"}]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();

    assert_eq!(result.path, "/v1/chat/completions");
    let body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    assert_eq!(body["messages"][0]["role"], "system");
    assert_eq!(
        body["messages"][0]["content"],
        "You are a helpful assistant.\nKeep responses concise."
    );
}

#[test]
fn test_anthropic_to_openai_tool_use() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "Let me check the weather."},
                            {
                                "type": "tool_use",
                                "id": "toolu_123",
                                "name": "get_weather",
                                "input": {"city": "Paris"}
                            }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();

    assert_eq!(result.path, "/v1/chat/completions");

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    assert_eq!(out_body["messages"][0]["role"], "assistant");
    assert_eq!(
        out_body["messages"][0]["content"],
        "Let me check the weather."
    );
    assert_eq!(out_body["messages"][0]["tool_calls"][0]["id"], "toolu_123");
    assert_eq!(out_body["messages"][0]["tool_calls"][0]["type"], "function");
    assert_eq!(
        out_body["messages"][0]["tool_calls"][0]["function"]["name"],
        "get_weather"
    );
}

#[test]
fn test_anthropic_to_openai_top_level_tools_and_tool_choice() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": "What's the weather in Paris?"
                    }
                ],
                "tools": [
                    {
                        "name": "get_weather",
                        "description": "Get weather for a city",
                        "input_schema": {
                            "type": "object",
                            "properties": { "city": { "type": "string" } },
                            "required": ["city"]
                        }
                    }
                ],
                "tool_choice": {"type": "any"}
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["tools"][0]["type"], "function");
    assert_eq!(out_body["tools"][0]["function"]["name"], "get_weather");
    assert_eq!(
        out_body["tools"][0]["function"]["description"],
        "Get weather for a city"
    );
    assert_eq!(
        out_body["tools"][0]["function"]["parameters"]["properties"]["city"]["type"],
        "string"
    );
    assert_eq!(out_body["tool_choice"], "required");
}

#[test]
fn test_anthropic_to_openai_specific_tool_choice() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "user",
                        "content": "Use the weather tool"
                    }
                ],
                "tools": [
                    {
                        "name": "get_weather",
                        "input_schema": {
                            "type": "object",
                            "properties": { "city": { "type": "string" } }
                        }
                    }
                ],
                "tool_choice": {"type": "tool", "name": "get_weather"}
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["tool_choice"]["type"], "function");
    assert_eq!(out_body["tool_choice"]["function"]["name"], "get_weather");
}

#[test]
fn test_anthropic_to_openai_rejects_unknown_tool_choice() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello"
                    }
                ],
                "tool_choice": {"type": "sometimes"}
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input);
    assert!(matches!(result, Err(TransformError::InvalidFormat(_))));
}

#[test]
fn test_anthropic_to_openai_thinking_enabled_strips_to_content_empty() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "user",
                        "content": "Think carefully"
                    }
                ],
                "thinking": {
                    "type": "enabled",
                    "budget_tokens": 2048,
                    "display": "summarized"
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    // `thinking` is Anthropic-specific; the OpenAI output must not carry it.
    assert!(
        out_body.get("enable_thinking").is_none(),
        "OpenAI Chat Completions has no `enable_thinking` parameter"
    );
    // The user message content must still be preserved.
    let messages = out_body["messages"].as_array().unwrap();
    assert_eq!(messages[0]["content"], "Think carefully");
}

#[test]
fn test_anthropic_to_openai_thinking_disabled_strips_to_content_empty() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "user",
                        "content": "Skip thinking"
                    }
                ],
                "thinking": {
                    "type": "disabled"
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    // `thinking` is Anthropic-specific; the OpenAI output must not carry it.
    assert!(
        out_body.get("enable_thinking").is_none(),
        "OpenAI Chat Completions has no `enable_thinking` parameter"
    );
    let messages = out_body["messages"].as_array().unwrap();
    assert_eq!(messages[0]["content"], "Skip thinking");
}

#[test]
fn test_anthropic_to_openai_lossy_downgrade_still_sets_content() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "thinking",
                                "thinking": "internal reasoning"
                            }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    assert_eq!(out_body["messages"][0]["role"], "assistant");
    assert_eq!(out_body["messages"][0]["content"], "");
}

#[test]
fn test_anthropic_to_openai_tool_result() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "tool_use",
                                "id": "toolu_123",
                                "name": "get_weather",
                                "input": {"city": "Paris"}
                            }
                        ]
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": "toolu_123",
                                "content": [{"type": "text", "text": "{\"temperature\":21}"}],
                                "is_error": false
                            }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    let messages = out_body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["role"], "assistant");
    assert_eq!(messages[0]["content"], "");
    assert_eq!(messages[0]["tool_calls"][0]["id"], "toolu_123");
    assert_eq!(messages[1]["role"], "tool");
    assert_eq!(messages[1]["tool_call_id"], "toolu_123");
    assert_eq!(messages[1]["content"], "{\"temperature\":21}");
}

#[test]
fn test_anthropic_to_openai_preserves_stream_flag() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "stream": true,
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Hello"}]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["stream"], serde_json::Value::Bool(true));
}

#[test]
fn test_anthropic_to_openai_invalid_json() {
    let input = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/messages".to_string(),
        body: Bytes::from("not valid json"),
    };

    let result = anthropic_to_openai(&input);
    assert!(matches!(result, Err(TransformError::InvalidFormat(_))));
}

#[test]
fn test_transform_headers_anthropic_to_openai() {
    let input = HashMap::from([
        ("x-api-key".to_string(), "my-key".to_string()),
        ("content-type".to_string(), "application/json".to_string()),
    ]);

    let result = transform_headers_anthropic_to_openai(&input);
    assert_eq!(
        result.get("authorization"),
        Some(&"Bearer my-key".to_string())
    );
    assert_eq!(
        result.get("content-type"),
        Some(&"application/json".to_string())
    );
}

// ---------------------------------------------------------------------------
// Anthropic → OpenAI Responses tests (Phase 5 — TDD)
// ---------------------------------------------------------------------------

#[test]
fn test_anthropic_to_openai_responses_basic() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 256,
                "system": "You are a concise assistant.",
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Say hello in one sentence."}]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();

    assert_eq!(
        result.headers.get("authorization"),
        Some(&"Bearer test-key".to_string())
    );
    assert_eq!(result.path, "/v1/responses");

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    assert_eq!(out_body["model"], "claude-sonnet-4-20250514");
    assert_eq!(out_body["instructions"], "You are a concise assistant.");
    assert_eq!(out_body["input"][0]["type"], "message");
    assert_eq!(out_body["input"][0]["role"], "user");
    assert_eq!(out_body["input"][0]["content"][0]["type"], "input_text");
    assert_eq!(
        out_body["input"][0]["content"][0]["text"],
        "Say hello in one sentence."
    );
    assert_eq!(out_body["max_output_tokens"], 256);
}

#[test]
fn test_anthropic_to_openai_responses_system_as_array() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 256,
                "system": [
                    { "type": "text", "text": "You are a helpful assistant." },
                    { "type": "text", "text": "Keep responses concise." }
                ],
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Hi"}]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(
        out_body["instructions"],
        "You are a helpful assistant.\nKeep responses concise."
    );
}

#[test]
fn test_anthropic_to_openai_responses_tool_use() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "Let me check the weather."},
                            {
                                "type": "tool_use",
                                "id": "toolu_123",
                                "name": "get_weather",
                                "input": {"city": "Paris"}
                            }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    // assistant message with text + function_call output items
    let input_items = out_body["input"].as_array().unwrap();
    // Should contain a message with assistant role and a function_call item
    let has_function_call = input_items
        .iter()
        .any(|item| item.get("type").and_then(|t| t.as_str()) == Some("function_call"));
    assert!(has_function_call, "expected function_call in input items");
}

#[test]
fn test_anthropic_to_openai_responses_tool_result() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "tool_use",
                                "id": "toolu_123",
                                "name": "get_weather",
                                "input": {"city": "Paris"}
                            }
                        ]
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": "toolu_123",
                                "content": [{"type": "text", "text": "{\"temperature\":21}"}],
                                "is_error": false
                            }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    let input_items = out_body["input"].as_array().unwrap();
    let has_function_call_output = input_items
        .iter()
        .any(|item| item.get("type").and_then(|t| t.as_str()) == Some("function_call_output"));
    assert!(
        has_function_call_output,
        "expected function_call_output in input items"
    );
}

#[test]
fn test_anthropic_to_openai_responses_top_level_tools_and_tool_choice() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": "What's the weather in Paris?"
                    }
                ],
                "tools": [
                    {
                        "name": "get_weather",
                        "description": "Get weather for a city",
                        "input_schema": {
                            "type": "object",
                            "properties": { "city": { "type": "string" } },
                            "required": ["city"]
                        }
                    }
                ],
                "tool_choice": {"type": "any"}
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["tools"][0]["type"], "function");
    assert_eq!(out_body["tools"][0]["name"], "get_weather");
    assert_eq!(
        out_body["tools"][0]["description"],
        "Get weather for a city"
    );
    assert_eq!(
        out_body["tools"][0]["parameters"]["properties"]["city"]["type"],
        "string"
    );
    // tool_choice "any" -> Responses "required"
    assert_eq!(out_body["tool_choice"], "required");
}

#[test]
fn test_anthropic_to_openai_responses_specific_tool_choice() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "user",
                        "content": "Use the weather tool"
                    }
                ],
                "tools": [
                    {
                        "name": "get_weather",
                        "input_schema": {
                            "type": "object",
                            "properties": { "city": { "type": "string" } }
                        }
                    }
                ],
                "tool_choice": {"type": "tool", "name": "get_weather"}
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["tool_choice"]["type"], "function");
    assert_eq!(out_body["tool_choice"]["name"], "get_weather");
}

#[test]
fn test_anthropic_to_openai_responses_thinking_lossy_downgrade() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "thinking",
                                "thinking": "internal reasoning"
                            }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    // thinking blocks are lossy downgraded — output should still be valid
    let input_items = out_body["input"].as_array().unwrap();
    assert!(!input_items.is_empty());
}

#[test]
fn test_anthropic_to_openai_responses_preserves_stream_flag() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "stream": true,
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Hello"}]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai_responses(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["stream"], serde_json::Value::Bool(true));
}

#[test]
fn test_anthropic_to_openai_responses_invalid_json() {
    let input = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/messages".to_string(),
        body: Bytes::from("not valid json"),
    };

    let result = anthropic_to_openai_responses(&input);
    assert!(matches!(result, Err(TransformError::InvalidFormat(_))));
}

// ---------------------------------------------------------------------------
// OpenAI → Anthropic tests
// ---------------------------------------------------------------------------

#[test]
fn test_openai_to_anthropic_basic() {
    let input = TransformRequest {
        headers: HashMap::from([
            (
                "authorization".to_string(),
                "Bearer OPENAI_API_KEY_PLACEHOLDER".to_string(),
            ),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "max_tokens": 256,
                "temperature": 0.7,
                "messages": [
                    { "role": "system", "content": "You are a concise assistant." },
                    { "role": "user", "content": "Say hello in one sentence." }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input).unwrap();

    assert_eq!(
        result.headers.get("x-api-key"),
        Some(&"OPENAI_API_KEY_PLACEHOLDER".to_string())
    );
    assert_eq!(result.path, "/v1/messages");

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    assert_eq!(out_body["model"], "gpt-4o");
    assert_eq!(out_body["max_tokens"], 256);
    assert_eq!(out_body["system"], "You are a concise assistant.");

    let messages = out_body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(
        messages[0]["content"][0]["text"],
        "Say hello in one sentence."
    );
}

#[test]
fn test_openai_to_anthropic_tool_result() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "messages": [
                    {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [{
                            "id": "call_abc123",
                            "type": "function",
                            "function": {
                                "name": "get_weather",
                                "arguments": "{\"city\":\"Paris\"}"
                            }
                        }]
                    },
                    {
                        "role": "tool",
                        "tool_call_id": "call_abc123",
                        "content": "{\"temperature\":21}"
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input).unwrap();

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    let messages = out_body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2);

    // First message: assistant with tool_use
    assert_eq!(messages[0]["role"], "assistant");
    let assistant_content = messages[0]["content"].as_array().unwrap();
    assert_eq!(assistant_content.len(), 1);
    assert_eq!(assistant_content[0]["type"], "tool_use");
    assert_eq!(assistant_content[0]["id"], "toolu_call_abc123");
    assert_eq!(assistant_content[0]["name"], "get_weather");
    assert_eq!(assistant_content[0]["input"]["city"], "Paris");

    // Second message: user with tool_result
    assert_eq!(messages[1]["role"], "user");
    let user_content = messages[1]["content"].as_array().unwrap();
    assert_eq!(user_content.len(), 1);
    assert_eq!(user_content[0]["type"], "tool_result");
    assert_eq!(user_content[0]["tool_use_id"], "toolu_call_abc123");
}

#[test]
fn test_openai_response_to_anthropic_message_with_thinking_and_tool_use() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "chatcmpl-thinking",
                "model": "qwen3.6-plus",
                "choices": [
                    {
                        "finish_reason": "tool_calls",
                        "message": {
                            "role": "assistant",
                            "reasoning_content": "Inspecting the route table.",
                            "content": "I need to query the code graph.",
                            "tool_calls": [
                                {
                                    "id": "call_abc123",
                                    "type": "function",
                                    "function": {
                                        "name": "codegraph_search",
                                        "arguments": "{\"query\":\"sso google login\"}"
                                    }
                                }
                            ]
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 42,
                    "completion_tokens": 11
                }
            }))
            .unwrap(),
        ),
    };

    let result = openai_response_to_anthropic_message(&input).unwrap();

    assert_eq!(result.headers["x-api-key"], "TEST_KEY");
    assert_eq!(result.path, "/v1/messages");

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    let content = out_body["content"].as_array().unwrap();

    assert_eq!(content[0]["type"], "thinking");
    assert_eq!(content[0]["thinking"], "Inspecting the route table.");
    assert_eq!(content[0]["signature"], SYNTHETIC_THINKING_SIGNATURE);
    assert_eq!(content[1]["type"], "text");
    assert_eq!(content[1]["text"], "I need to query the code graph.");
    assert_eq!(content[2]["type"], "tool_use");
    assert_eq!(content[2]["id"], "call_abc123");
    assert_eq!(content[2]["name"], "codegraph_search");
    assert_eq!(content[2]["input"]["query"], "sso google login");
    assert_eq!(out_body["stop_reason"], "tool_use");
    assert_eq!(out_body["usage"]["input_tokens"], 42);
    assert_eq!(out_body["usage"]["output_tokens"], 11);
}

#[test]
fn test_anthropic_response_to_openai_response_with_thinking_and_tool_use() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg_123",
                "type": "message",
                "role": "assistant",
                "model": "qwen-plus-anthropic",
                "content": [
                    {
                        "type": "thinking",
                        "thinking": "Inspecting the route table.",
                        "signature": SYNTHETIC_THINKING_SIGNATURE
                    },
                    {
                        "type": "text",
                        "text": "I need to query the code graph."
                    },
                    {
                        "type": "tool_use",
                        "id": "toolu_abc123",
                        "name": "codegraph_search",
                        "input": {
                            "query": "sso google login"
                        }
                    }
                ],
                "stop_reason": "tool_use",
                "stop_sequence": null,
                "usage": {
                    "input_tokens": 42,
                    "output_tokens": 11
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_response_to_openai_response(&input).unwrap();

    assert_eq!(result.headers["authorization"], "Bearer TEST_KEY");
    assert_eq!(result.path, "/v1/chat/completions");

    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
    let message = &out_body["choices"][0]["message"];

    assert_eq!(out_body["id"], "msg_123");
    assert_eq!(out_body["object"], "chat.completion");
    assert_eq!(out_body["model"], "qwen-plus-anthropic");
    assert_eq!(message["role"], "assistant");
    assert_eq!(message["reasoning_content"], "Inspecting the route table.");
    assert_eq!(message["content"], "I need to query the code graph.");
    assert_eq!(message["tool_calls"][0]["id"], "toolu_abc123");
    assert_eq!(
        message["tool_calls"][0]["function"]["name"],
        "codegraph_search"
    );
    assert_eq!(
        message["tool_calls"][0]["function"]["arguments"],
        "{\"query\":\"sso google login\"}"
    );
    assert_eq!(out_body["choices"][0]["finish_reason"], "tool_calls");
    assert_eq!(out_body["usage"]["prompt_tokens"], 42);
    assert_eq!(out_body["usage"]["completion_tokens"], 11);
    assert_eq!(out_body["usage"]["total_tokens"], 53);
}

#[test]
fn test_responses_to_anthropic_basic_request() {
    let input = TransformRequest {
        headers: HashMap::from([("authorization".to_string(), "Bearer TEST_KEY".to_string())]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "instructions": "You are concise.",
                "input": "Hello from Responses",
                "max_output_tokens": 128,
                "stream": true,
                "tools": [{
                    "type": "function",
                    "name": "get_weather",
                    "description": "Get weather for a city",
                    "parameters": {
                        "type": "object",
                        "properties": { "city": { "type": "string" } },
                        "required": ["city"]
                    }
                }],
                "tool_choice": "required"
            }))
            .unwrap(),
        ),
    };

    let result = responses_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(result.path, "/v1/messages");
    assert_eq!(result.headers["x-api-key"], "TEST_KEY");
    assert_eq!(out_body["model"], "qwen3.6-plus");
    assert_eq!(out_body["system"], "You are concise.");
    assert_eq!(out_body["messages"][0]["role"], "user");
    assert_eq!(
        out_body["messages"][0]["content"][0]["text"],
        "Hello from Responses"
    );
    assert_eq!(out_body["max_tokens"], 128);
    assert_eq!(out_body["stream"], serde_json::Value::Bool(true));
    assert_eq!(out_body["tools"][0]["name"], "get_weather");
    assert_eq!(out_body["tool_choice"]["type"], "any");
}

#[test]
fn test_anthropic_response_to_responses_response_with_thinking_and_tool_use() {
    let input = TransformRequest {
        headers: HashMap::from([("x-api-key".to_string(), "TEST_KEY".to_string())]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg_123",
                "type": "message",
                "role": "assistant",
                "model": "qwen-plus-anthropic",
                "content": [
                    {
                        "type": "thinking",
                        "thinking": "Inspecting the route table.",
                        "signature": SYNTHETIC_THINKING_SIGNATURE
                    },
                    {
                        "type": "text",
                        "text": "I need to query the code graph."
                    },
                    {
                        "type": "tool_use",
                        "id": "toolu_abc123",
                        "name": "codegraph_search",
                        "input": { "query": "sso google login" }
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {
                    "input_tokens": 42,
                    "output_tokens": 11
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_response_to_responses_response(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(result.path, "/v1/responses");
    assert_eq!(out_body["object"], "response");
    assert_eq!(out_body["id"], "msg_123");
    assert_eq!(out_body["status"], "completed");
    assert_eq!(out_body["output_text"], "I need to query the code graph.");
    assert_eq!(out_body["output"][0]["type"], "message");
    assert_eq!(
        out_body["output"][0]["content"][0]["type"],
        "reasoning_text"
    );
    assert_eq!(out_body["output"][1]["content"][0]["type"], "output_text");
    assert_eq!(out_body["output"][2]["type"], "function_call");
    assert_eq!(out_body["output"][2]["call_id"], "toolu_abc123");
    assert_eq!(
        out_body["output"][2]["arguments"],
        "{\"query\":\"sso google login\"}"
    );
    assert_eq!(out_body["usage"]["total_tokens"], 53);
}

#[test]
fn test_openai_to_anthropic_preserves_stream_flag() {
    let input = TransformRequest {
        headers: HashMap::from([("authorization".to_string(), "Bearer TEST_KEY".to_string())]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "qwen3.6-plus",
                "stream": true,
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello"
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["stream"], serde_json::Value::Bool(true));
}

#[test]
fn test_openai_to_anthropic_invalid_json() {
    let input = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from("not json"),
    };

    let result = openai_to_anthropic(&input);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        TransformError::InvalidFormat(_)
    ));
}

// ---------------------------------------------------------------------------
// Fixture-based integration tests for non-streaming transforms
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct NonStreamFixture {
    name: String,
    #[allow(dead_code)]
    mode: String,
    input: NonStreamInput,
    expected: NonStreamExpected,
}

#[derive(Debug, Deserialize)]
struct NonStreamInput {
    headers: HashMap<String, String>,
    path: String,
    body: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct NonStreamExpected {
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    path: Option<String>,
    body: serde_json::Value,
}

#[allow(clippy::disallowed_methods)] // sync #[test] context; fixture files are small
fn load_nonstream_fixture(path: &str) -> NonStreamFixture {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let full_path = format!("{manifest_dir}/../../{path}");
    let content =
        std::fs::read_to_string(&full_path).unwrap_or_else(|e| panic!("{full_path}: {e}"));
    serde_json::from_str(&content).expect("fixture JSON parse")
}

fn run_nonstream_fixture(
    path: &str,
    transform_fn: fn(&TransformRequest) -> Result<TransformResponse, TransformError>,
) {
    let fixture = load_nonstream_fixture(path);
    let input = TransformRequest {
        headers: fixture.input.headers.clone(),
        path: fixture.input.path.clone(),
        body: Bytes::from(serde_json::to_vec(&fixture.input.body).unwrap()),
    };

    let result = transform_fn(&input);

    // If expected path is None, the fixture expects an error
    if fixture.expected.path.is_none() {
        assert!(
            result.is_err(),
            "expected error for {} but got success",
            fixture.name
        );
        return;
    }

    let result = result.unwrap_or_else(|e| panic!("transform failed for {}: {e}", fixture.name));

    // Verify headers
    for (key, expected_val) in &fixture.expected.headers {
        let actual = result.headers.get(key);
        assert_eq!(
            actual,
            Some(expected_val),
            "header mismatch for {}: key={key}, expected={expected_val}, actual={actual:?}",
            fixture.name
        );
    }

    // Verify path
    let expected_path = fixture
        .expected
        .path
        .as_ref()
        .expect("expected path should be Some");
    assert_eq!(
        result.path, *expected_path,
        "path mismatch for {}: expected={}, actual={}",
        fixture.name, expected_path, result.path
    );

    // Verify body (compare as JSON, not byte-for-byte)
    let actual_body: serde_json::Value = serde_json::from_slice(&result.body)
        .unwrap_or_else(|e| panic!("output body not valid JSON for {}: {e}", fixture.name));
    assert_json_subset(&actual_body, &fixture.expected.body, &fixture.name);
}

/// Assert that `actual` contains at least the fields in `expected`.
fn assert_json_subset(actual: &serde_json::Value, expected: &serde_json::Value, name: &str) {
    match (actual, expected) {
        (serde_json::Value::Object(a), serde_json::Value::Object(e)) => {
            for (k, ev) in e {
                let av = a
                    .get(k)
                    .unwrap_or_else(|| panic!("missing key '{k}' in {name}"));
                assert_json_subset(av, ev, name);
            }
        }
        (serde_json::Value::Array(a), serde_json::Value::Array(ev)) => {
            assert_eq!(
                a.len(),
                ev.len(),
                "array length mismatch in {name}: expected={}, actual={}",
                ev.len(),
                a.len()
            );
            for (i, (av, ev)) in a.iter().zip(ev.iter()).enumerate() {
                assert_json_subset(av, ev, &format!("{name}[{i}]"));
            }
        }
        (a, e) => {
            assert_eq!(a, e, "value mismatch in {name}: expected={e}, actual={a}");
        }
    }
}

#[test]
fn test_fixture_anthropic_to_openai_basic() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/non-stream-basic.json",
        anthropic_to_openai,
    );
}

#[test]
fn test_fixture_anthropic_to_openai_tool_use() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/non-stream-tool-use.json",
        anthropic_to_openai,
    );
}

#[test]
fn test_fixture_anthropic_to_openai_tool_result() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/non-stream-tool-result.json",
        anthropic_to_openai,
    );
}

#[test]
fn test_fixture_anthropic_to_openai_top_level_tools() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/non-stream-top-level-tools.json",
        anthropic_to_openai,
    );
}

#[test]
fn test_fixture_anthropic_response_to_openai_thinking_and_tool_use() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/non-stream-response-thinking-tool-use.\
         json",
        anthropic_response_to_openai_response,
    );
}

#[test]
fn test_fixture_anthropic_response_to_responses_thinking_and_tool_use() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/\
         non-stream-responses-response-thinking-tool-use.json",
        anthropic_response_to_responses_response,
    );
}

#[test]
fn test_fixture_openai_to_anthropic_tool_result() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/openai-to-anthropic/non-stream-tool-result.json",
        openai_to_anthropic,
    );
}

#[test]
fn test_fixture_responses_to_anthropic_basic() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/openai-to-anthropic/non-stream-responses-basic.json",
        responses_to_anthropic,
    );
}

#[test]
fn test_fixture_openai_response_to_anthropic_thinking() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/openai-to-anthropic/non-stream-response-thinking.json",
        openai_response_to_anthropic_message,
    );
}

#[test]
fn test_fixture_anthropic_to_openai_responses_basic() {
    run_nonstream_fixture(
        "fixtures/protocol-transform/anthropic-to-openai/non-stream-responses-basic.json",
        anthropic_to_openai_responses,
    );
}

// ---------------------------------------------------------------------------
// Spec 92: Cache & Reasoning Token Fields — TDD tests (failing first)
// ---------------------------------------------------------------------------

#[test]
fn test_anthropic_response_to_openai_response_includes_cache_read_tokens() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg_cache",
                "type": "message",
                "role": "assistant",
                "model": "claude-sonnet-4-20250514",
                "content": [
                    {"type": "text", "text": "Hello"}
                ],
                "stop_reason": "end_turn",
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 20,
                    "cache_read_input_tokens": 50,
                    "cache_creation_input_tokens": 30,
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_response_to_openai_response(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    let usage = &out_body["usage"];
    assert_eq!(usage["prompt_tokens"], 100);
    assert_eq!(usage["completion_tokens"], 20);
    assert_eq!(usage["prompt_tokens_details"]["cached_tokens"], 50);
}

#[test]
fn test_openai_response_to_anthropic_message_includes_cache_and_reasoning_tokens() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "chatcmpl_cache",
                "model": "gpt-4o",
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": "Hello"
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 20,
                    "prompt_tokens_details": {
                        "cached_tokens": 80
                    },
                    "completion_tokens_details": {
                        "reasoning_tokens": 10
                    }
                }
            }))
            .unwrap(),
        ),
    };

    let result = openai_response_to_anthropic_message(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    let usage = &out_body["usage"];
    assert_eq!(usage["input_tokens"], 100);
    assert_eq!(usage["output_tokens"], 20);
    assert_eq!(usage["cache_read_input_tokens"], 80);
}

#[test]
fn test_anthropic_response_to_openai_response_backwards_compat_missing_cache_fields() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "msg_nocache",
                "type": "message",
                "role": "assistant",
                "model": "claude-sonnet-4-20250514",
                "content": [
                    {"type": "text", "text": "Hello"}
                ],
                "stop_reason": "end_turn",
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 20,
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_response_to_openai_response(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    let usage = &out_body["usage"];
    assert_eq!(usage["prompt_tokens"], 100);
    assert_eq!(usage["prompt_tokens_details"]["cached_tokens"], 0);
    assert_eq!(usage["completion_tokens_details"]["reasoning_tokens"], 0);
}

// ---------------------------------------------------------------------------
// Bug C1: Anthropic `thinking` must be stripped, not leaked as `enable_thinking`
// ---------------------------------------------------------------------------

#[test]
fn test_anthropic_to_openai_thinking_enabled_does_not_leak_enable_thinking() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    { "role": "user", "content": "Think carefully" }
                ],
                "thinking": {
                    "type": "enabled",
                    "budget_tokens": 2048
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert!(
        out_body.get("enable_thinking").is_none(),
        "OpenAI Chat Completions has no `enable_thinking` parameter;          Anthropic \
         `thinking` must be stripped, not mapped"
    );
}

#[test]
fn test_anthropic_to_openai_thinking_disabled_does_not_leak_enable_thinking() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    { "role": "user", "content": "Skip thinking" }
                ],
                "thinking": {
                    "type": "disabled"
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert!(
        out_body.get("enable_thinking").is_none(),
        "OpenAI Chat Completions has no `enable_thinking` parameter;          Anthropic \
         `thinking` must be stripped, not mapped"
    );
}

#[test]
fn test_anthropic_to_openai_thinking_adaptive_does_not_leak_enable_thinking() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "messages": [
                    { "role": "user", "content": "Think adaptively" }
                ],
                "thinking": {
                    "type": "adaptive"
                }
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    assert!(
        out_body.get("enable_thinking").is_none(),
        "OpenAI Chat Completions has no `enable_thinking` parameter"
    );
}

// ---------------------------------------------------------------------------
// Bug C2: OpenAI `enable_thinking: true` must emit `budget_tokens` (>= 1024)
// ---------------------------------------------------------------------------

#[test]
fn test_openai_to_anthropic_enable_thinking_true_emits_budget_tokens() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "messages": [
                    { "role": "user", "content": "Think carefully" }
                ],
                "enable_thinking": true
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    let thinking = &out_body["thinking"];
    assert_eq!(thinking["type"], "enabled");
    let budget = thinking["budget_tokens"]
        .as_u64()
        .expect("budget_tokens must be present and numeric");
    assert!(
        budget >= 1024,
        "Anthropic requires budget_tokens >= 1024 when thinking is enabled, got {budget}"
    );
}

#[test]
fn test_openai_to_anthropic_enable_thinking_false_emits_disabled_without_budget() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "messages": [
                    { "role": "user", "content": "Skip thinking" }
                ],
                "enable_thinking": false
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value = serde_json::from_slice(&result.body).unwrap();

    let thinking = &out_body["thinking"];
    assert_eq!(thinking["type"], "disabled");
    assert!(
        thinking.get("budget_tokens").is_none(),
        "disabled thinking should not include budget_tokens"
    );
}

// ---------------------------------------------------------------------------
// H4: Model name character set validation
// ---------------------------------------------------------------------------

#[test]
fn test_validate_model_name_accepts_valid_names() {
    use crate::model::validate_model_name;

    assert!(validate_model_name("gpt-4o").is_ok());
    assert!(validate_model_name("claude-sonnet-4-20250514").is_ok());
    assert!(validate_model_name("qwen3.6-plus").is_ok());
    assert!(validate_model_name("model_v2").is_ok());
    assert!(validate_model_name("a").is_ok());
}

#[test]
fn test_validate_model_name_rejects_path_traversal() {
    use crate::model::validate_model_name;

    assert!(validate_model_name("../../admin/endpoint").is_err());
    assert!(validate_model_name("foo/bar").is_err());
    assert!(validate_model_name("../etc/passwd").is_err());
    assert!(validate_model_name("model with spaces").is_err());
    assert!(validate_model_name("model@name").is_err());
}

#[test]
fn test_validate_model_name_rejects_empty() {
    use crate::model::validate_model_name;

    let err = validate_model_name("").unwrap_err();
    assert!(matches!(err, TransformError::InvalidFormat(_)));
}

#[test]
fn test_validate_model_name_rejects_too_long() {
    use crate::model::validate_model_name;

    let long_name = "a".repeat(129);
    assert!(validate_model_name(&long_name).is_err());
}

#[test]
fn test_anthropic_to_openai_rejects_malicious_model_name() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "../../admin/endpoint",
                "messages": [{"role": "user", "content": "hi"}]
            }))
            .unwrap(),
        ),
    };

    let result = anthropic_to_openai(&input);
    assert!(matches!(result, Err(TransformError::InvalidFormat(_))));
}

#[test]
fn test_openai_to_anthropic_rejects_malicious_model_name() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "../etc/passwd",
                "messages": [{"role": "user", "content": "hi"}]
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input);
    assert!(matches!(result, Err(TransformError::InvalidFormat(_))));
}

#[test]
fn test_responses_to_anthropic_rejects_malicious_model_name() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "model/subvert",
                "input": "hello"
            }))
            .unwrap(),
        ),
    };

    let result = responses_to_anthropic(&input);
    assert!(matches!(result, Err(TransformError::InvalidFormat(_))));
}

// ---------------------------------------------------------------------------
// H5: Request body byte size limit
// ---------------------------------------------------------------------------

#[test]
fn test_parse_anthropic_body_rejects_oversized_body() {
    use crate::model::MAX_REQUEST_BODY_BYTES;

    let oversized = serde_json::to_vec(&json!({
        "model": "claude-sonnet-4-20250514",
        "messages": [{"role": "user", "content": "x".repeat(MAX_REQUEST_BODY_BYTES)}]
    }))
    .unwrap();

    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(oversized),
    };

    let result = anthropic_to_openai(&input);
    assert!(matches!(
        result,
        Err(TransformError::BufferLimitExceeded(_))
    ));
}

#[test]
fn test_parse_openai_body_rejects_oversized_body() {
    use crate::model::MAX_REQUEST_BODY_BYTES;

    let oversized = serde_json::to_vec(&json!({
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "x".repeat(MAX_REQUEST_BODY_BYTES)}]
    }))
    .unwrap();

    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(oversized),
    };

    let result = openai_to_anthropic(&input);
    assert!(matches!(
        result,
        Err(TransformError::BufferLimitExceeded(_))
    ));
}

#[test]
fn test_parse_responses_body_rejects_oversized_body() {
    use crate::model::MAX_REQUEST_BODY_BYTES;

    let oversized = serde_json::to_vec(&json!({
        "model": "gpt-4o",
        "input": "x".repeat(MAX_REQUEST_BODY_BYTES)
    }))
    .unwrap();

    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(oversized),
    };

    let result = responses_to_anthropic(&input);
    assert!(matches!(
        result,
        Err(TransformError::BufferLimitExceeded(_))
    ));
}

#[test]
fn test_parse_body_under_limit_succeeds() {
    let small_body = serde_json::to_vec(&json!({
        "model": "claude-sonnet-4-20250514",
        "messages": [{"role": "user", "content": "hello"}]
    }))
    .unwrap();

    let input = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "test-key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(small_body),
    };

    assert!(anthropic_to_openai(&input).is_ok());
}

// ---------------------------------------------------------------------------
// M2: deny_unknown_fields — reject unknown fields in request bodies
// ---------------------------------------------------------------------------

// NOTE: test_anthropic_body_rejects_unknown_fields removed — AnthropicBody
// intentionally does NOT use deny_unknown_fields because Claude Code and
// other Anthropic SDK clients may send fields we don't model.

#[test]
fn test_openai_body_rejects_unknown_fields() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer key".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": "hi"}],
                "secret_exfil": "should be rejected"
            }))
            .unwrap(),
        ),
    };

    let result = openai_to_anthropic(&input);
    assert!(
        matches!(result, Err(TransformError::InvalidFormat(_))),
        "expected InvalidFormat for unknown field, got {result:?}"
    );
}

// NOTE: test_responses_body_rejects_unknown_fields removed — OpenAiResponsesRequestBody
// intentionally does NOT use deny_unknown_fields for compatibility with various
// OpenAI SDK clients that may send additional fields.

// ---------------------------------------------------------------------------
// Responses API response → Anthropic response のテスト
// ---------------------------------------------------------------------------

/// reasoning + message(output_text) + usage を含む標準レスポンスが正しく変換されること。
#[test]
fn test_responses_response_to_anthropic_basic() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_abc123",
                "status": "completed",
                "model": "qwen3.6-plus",
                "output": [
                    {
                        "type": "reasoning",
                        "summary": [
                            { "type": "output_text", "text": "Thinking step by step..." }
                        ]
                    },
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            { "type": "output_text", "text": "The answer is 42." }
                        ]
                    }
                ],
                "usage": {
                    "input_tokens": 50,
                    "output_tokens": 30,
                    "input_tokens_details": {
                        "cached_tokens": 10
                    }
                }
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input).unwrap();
    assert_eq!(result.headers["x-api-key"], "TEST_KEY");
    assert_eq!(result.path, "/v1/messages");

    let out_body: serde_json::Value =
        serde_json::from_slice(&result.body).unwrap();
    let content = out_body["content"].as_array().unwrap();

    assert_eq!(content.len(), 2, "should have thinking + text blocks");
    assert_eq!(content[0]["type"], "thinking");
    assert_eq!(content[0]["thinking"], "Thinking step by step...");
    assert_eq!(content[1]["type"], "text");
    assert_eq!(content[1]["text"], "The answer is 42.");
    assert_eq!(out_body["stop_reason"], "end_turn");
    assert_eq!(out_body["usage"]["input_tokens"], 50);
    assert_eq!(out_body["usage"]["output_tokens"], 30);
    assert_eq!(out_body["usage"]["cache_read_input_tokens"], 10);
    assert_eq!(out_body["usage"]["cache_creation_input_tokens"], 0);
}

/// reasoning ブロックがない場合、thinking ブロックが生成されないこと。
#[test]
fn test_responses_response_to_anthropic_missing_reasoning() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_no_reasoning",
                "status": "completed",
                "model": "qwen3.6-plus",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            { "type": "output_text", "text": "No reasoning here." }
                        ]
                    }
                ],
                "usage": { "input_tokens": 10, "output_tokens": 5 }
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value =
        serde_json::from_slice(&result.body).unwrap();
    let content = out_body["content"].as_array().unwrap();

    assert_eq!(content.len(), 1, "should have only text block");
    assert_eq!(content[0]["type"], "text");
    assert!(
        content[0].get("thinking").is_none(),
        "no thinking block when reasoning is absent"
    );
}

/// function_call を含むレスポンスが tool_use ブロックに変換されること。
#[test]
fn test_responses_response_to_anthropic_with_tool_use() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_tool",
                "status": "completed",
                "model": "qwen3.6-plus",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            { "type": "output_text", "text": "Let me check the weather." }
                        ]
                    },
                    {
                        "type": "function_call",
                        "call_id": "call_weather_01",
                        "name": "get_weather",
                        "arguments": "{\"city\":\"Tokyo\"}"
                    }
                ],
                "usage": { "input_tokens": 20, "output_tokens": 15 }
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value =
        serde_json::from_slice(&result.body).unwrap();
    let content = out_body["content"].as_array().unwrap();

    assert_eq!(content.len(), 2, "should have text + tool_use blocks");
    assert_eq!(content[0]["type"], "text");
    assert_eq!(content[0]["text"], "Let me check the weather.");
    assert_eq!(content[1]["type"], "tool_use");
    assert_eq!(content[1]["id"], "call_weather_01");
    assert_eq!(content[1]["name"], "get_weather");
    assert_eq!(content[1]["input"]["city"], "Tokyo");
    assert_eq!(out_body["stop_reason"], "end_turn");
}

/// output が空配列の場合、content も空になること。
#[test]
fn test_responses_response_to_anthropic_empty_output() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_empty",
                "status": "completed",
                "model": "qwen3.6-plus",
                "output": [],
                "usage": { "input_tokens": 5, "output_tokens": 0 }
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value =
        serde_json::from_slice(&result.body).unwrap();
    let content = out_body["content"].as_array().unwrap();

    assert!(
        content.is_empty(),
        "empty output should produce empty content"
    );
    assert_eq!(out_body["stop_reason"], "end_turn");
}

/// status=failed のレスポンスは Err(TransformError::InvalidFormat) を返すこと。
#[test]
fn test_responses_response_to_anthropic_status_failed() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_failed",
                "status": "failed",
                "model": "qwen3.6-plus",
                "output": [],
                "usage": { "input_tokens": 5, "output_tokens": 0 }
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input);
    assert!(result.is_err(), "status=failed should return an error");
    assert!(
        matches!(result.unwrap_err(), TransformError::InvalidFormat(_)),
        "expected InvalidFormat error"
    );
}

/// status=incomplete + reason=max_output_tokens で stop_reason が max_tokens になること。
#[test]
fn test_responses_response_to_anthropic_incomplete_max_output_tokens() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_incomplete",
                "status": "incomplete",
                "model": "qwen3.6-plus",
                "incomplete_details": { "reason": "max_output_tokens" },
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            { "type": "output_text", "text": "Partial output" }
                        ]
                    }
                ],
                "usage": { "input_tokens": 10, "output_tokens": 5 }
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value =
        serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["stop_reason"], "max_tokens");
}

/// 無効な JSON ボディは Err(TransformError::InvalidFormat) を返すこと。
#[test]
fn test_responses_response_to_anthropic_invalid_json() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from("not valid json"),
    };

    let result = responses_response_to_anthropic(&input);
    assert!(result.is_err(), "invalid JSON should return an error");
    assert!(
        matches!(result.unwrap_err(), TransformError::InvalidFormat(_)),
        "expected InvalidFormat error"
    );
}

/// usage が欠落している場合、全 usage 値が 0 になること。
#[test]
fn test_responses_response_to_anthropic_missing_usage() {
    let input = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer TEST_KEY".to_string()),
        ]),
        path: "/v1/responses".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "id": "resp_no_usage",
                "status": "completed",
                "model": "qwen3.6-plus",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            { "type": "output_text", "text": "No usage data" }
                        ]
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    let result = responses_response_to_anthropic(&input).unwrap();
    let out_body: serde_json::Value =
        serde_json::from_slice(&result.body).unwrap();

    assert_eq!(out_body["usage"]["input_tokens"], 0);
    assert_eq!(out_body["usage"]["output_tokens"], 0);
    assert_eq!(out_body["usage"]["cache_read_input_tokens"], 0);
    assert_eq!(out_body["usage"]["cache_creation_input_tokens"], 0);
}

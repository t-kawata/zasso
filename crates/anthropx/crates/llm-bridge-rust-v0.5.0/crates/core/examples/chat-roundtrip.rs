// Anthropic <-> OpenAI chat roundtrip example
//
// Verifies the complete bidirectional protocol transform flow:
//   1. Anthropic request -> OpenAI request (anthropic_to_openai)
//   2. OpenAI request -> Anthropic request (openai_to_anthropic)
//
// Run: cargo run --example chat-roundtrip

use std::collections::HashMap;

use bytes::Bytes;
use llm_bridge_core::{
    model::TransformRequest,
    transform::{anthropic_to_openai, openai_to_anthropic},
};
use serde_json::json;

// ---------------------------------------------------------------------------
// Scene 1: simple text conversation
// ---------------------------------------------------------------------------

fn scene_1_simple_text() -> anyhow::Result<()> {
    println!("=== Scene 1: Simple text conversation ===\n");

    // 1. Construct Anthropic request
    let anthropic_req = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "sk-ant-test".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 256,
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Say hello"}]
                    }
                ]
            }))
            .expect("scene 1: serialize Anthropic request"),
        ),
    };

    // 2. Convert to OpenAI request
    let openai_req = anthropic_to_openai(&anthropic_req)?;
    let openai_body: serde_json::Value =
        serde_json::from_slice(&openai_req.body).expect("scene 1: parse OpenAI body");
    println!(
        "-> OpenAI request:\n{}\n",
        serde_json::to_string_pretty(&openai_body).unwrap()
    );

    // 3. Assertions
    assert_eq!(openai_req.path, "/v1/chat/completions", "scene 1: path");
    assert_eq!(openai_body["messages"][0]["role"], "user", "scene 1: role");
    assert_eq!(
        openai_body["messages"][0]["content"], "Say hello",
        "scene 1: content"
    );

    println!("✓ Scene 1: Simple text conversation passed\n");
    Ok(())
}

// ---------------------------------------------------------------------------
// Scene 2: system prompt
// ---------------------------------------------------------------------------

fn scene_2_system_prompt() -> anyhow::Result<()> {
    println!("=== Scene 2: System prompt ===\n");

    // 1. Construct Anthropic request with system prompt
    let anthropic_req = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "sk-ant-test".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 512,
                "system": "You are a concise assistant.",
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "Summarize Rust in 3 sentences."}]
                    }
                ]
            }))
            .expect("scene 2: serialize Anthropic request"),
        ),
    };

    // 2. Convert to OpenAI request
    let openai_req = anthropic_to_openai(&anthropic_req)?;
    let openai_body: serde_json::Value =
        serde_json::from_slice(&openai_req.body).expect("scene 2: parse OpenAI body");
    println!(
        "-> OpenAI request:\n{}\n",
        serde_json::to_string_pretty(&openai_body).unwrap()
    );

    // 3. Assertions
    assert_eq!(openai_req.path, "/v1/chat/completions", "scene 2: path");
    assert_eq!(
        openai_body["messages"][0]["role"], "system",
        "scene 2: system role"
    );
    assert_eq!(
        openai_body["messages"][0]["content"], "You are a concise assistant.",
        "scene 2: system content"
    );
    assert_eq!(
        openai_body["messages"][1]["role"], "user",
        "scene 2: user role"
    );

    println!("✓ Scene 2: System prompt passed\n");
    Ok(())
}

// ---------------------------------------------------------------------------
// Scene 3: tool use roundtrip (bidirectional)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_lines)]
fn scene_3_tool_use() -> anyhow::Result<()> {
    println!("=== Scene 3: Tool use roundtrip ===\n");

    // --- Direction 1: Anthropic tool_use -> OpenAI ---

    let anthropic_req = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "sk-ant-test".to_string()),
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
                        "content": [{"type": "text", "text": "What's the weather in Tokyo?"}]
                    },
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "tool_use",
                                "id": "call_abc123",
                                "name": "get_weather",
                                "input": {"city": "Tokyo"}
                            }
                        ]
                    }
                ]
            }))
            .expect("scene 3: serialize Anthropic request"),
        ),
    };

    let openai_req = anthropic_to_openai(&anthropic_req)?;
    let openai_body: serde_json::Value =
        serde_json::from_slice(&openai_req.body).expect("scene 3: parse OpenAI request body");
    println!(
        "-> Anthropic -> OpenAI:\n{}\n",
        serde_json::to_string_pretty(&openai_body).unwrap()
    );

    assert_eq!(
        openai_body["messages"][1]["role"], "assistant",
        "scene 3: assistant role"
    );
    assert!(
        openai_body["messages"][1]["tool_calls"].is_array(),
        "scene 3: tool_calls array exists"
    );
    let tc = &openai_body["messages"][1]["tool_calls"][0];
    assert_eq!(tc["id"], "call_abc123", "scene 3: tool_call id preserved");
    assert_eq!(tc["function"]["name"], "get_weather", "scene 3: tool name");

    // --- Direction 2: OpenAI tool_result -> Anthropic ---

    let openai_tool_result = TransformRequest {
        headers: HashMap::from([
            (
                "authorization".to_string(),
                "Bearer sk-oai-test".to_string(),
            ),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "messages": [
                    { "role": "user", "content": "What's the weather in Tokyo?" },
                    {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_abc123",
                                "type": "function",
                                "function": {
                                    "name": "get_weather",
                                    "arguments": "{\"city\": \"Tokyo\"}"
                                }
                            }
                        ],
                        "content": ""
                    },
                    {
                        "role": "tool",
                        "tool_call_id": "call_abc123",
                        "content": "22°C, partly cloudy"
                    }
                ]
            }))
            .expect("scene 3: serialize OpenAI tool_result request"),
        ),
    };

    let anthropic_back = openai_to_anthropic(&openai_tool_result)?;
    let anthropic_body: serde_json::Value = serde_json::from_slice(&anthropic_back.body)
        .expect("scene 3: parse Anthropic response body");
    println!(
        "-> OpenAI -> Anthropic:\n{}\n",
        serde_json::to_string_pretty(&anthropic_body).unwrap()
    );

    assert_eq!(
        anthropic_back.path, "/v1/messages",
        "scene 3: path maps back"
    );
    assert!(
        anthropic_back.headers.contains_key("x-api-key"),
        "scene 3: x-api-key header present"
    );
    let tool_result_msg = &anthropic_body["messages"][2];
    assert_eq!(
        tool_result_msg["role"], "user",
        "scene 3: tool result is user role"
    );
    assert_eq!(
        tool_result_msg["content"][0]["tool_use_id"], "toolu_call_abc123",
        "scene 3: tool_call_id -> toolu_call_abc123"
    );
    assert_eq!(
        tool_result_msg["content"][0]["content"][0]["text"], "22°C, partly cloudy",
        "scene 3: tool result text"
    );

    println!("✓ Scene 3: Tool use roundtrip passed\n");
    Ok(())
}

// ---------------------------------------------------------------------------
// Scene 4: multi-turn conversation
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_lines)]
fn scene_4_multi_turn() -> anyhow::Result<()> {
    println!("=== Scene 4: Multi-turn conversation ===\n");

    // 1. Construct a 3-turn Anthropic conversation
    let anthropic_req = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "sk-ant-test".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "system": "You are a helpful coding assistant.",
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "What is a HashMap?"}]
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "A HashMap is a hash table based collection."}]
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "How do I iterate over it?"}]
                    }
                ]
            }))
            .expect("scene 4: serialize Anthropic request"),
        ),
    };

    // 2. Convert to OpenAI request
    let openai_req = anthropic_to_openai(&anthropic_req)?;
    let openai_body: serde_json::Value =
        serde_json::from_slice(&openai_req.body).expect("scene 4: parse OpenAI body");
    println!(
        "-> OpenAI request:\n{}\n",
        serde_json::to_string_pretty(&openai_body).unwrap()
    );

    // 3. Assertions
    assert_eq!(openai_req.path, "/v1/chat/completions", "scene 4: path");
    assert_eq!(
        openai_body["messages"].as_array().unwrap().len(),
        4,
        "scene 4: 4 messages (system + 3 turns)"
    );
    assert_eq!(
        openai_body["messages"][0]["role"], "system",
        "scene 4: system"
    );
    assert_eq!(
        openai_body["messages"][1]["role"], "user",
        "scene 4: turn 1 user"
    );
    assert_eq!(
        openai_body["messages"][2]["role"], "assistant",
        "scene 4: turn 1 assistant"
    );
    assert_eq!(
        openai_body["messages"][3]["role"], "user",
        "scene 4: turn 2 user"
    );

    // Role alternation: user/assistant/user/assistant pattern
    let msgs = openai_body["messages"].as_array().unwrap();
    for i in 1..msgs.len() {
        let prev = msgs[i - 1]["role"].as_str().unwrap();
        let curr = msgs[i]["role"].as_str().unwrap();
        if prev == "system" {
            assert_eq!(curr, "user", "scene 4: system followed by user");
        } else {
            assert_ne!(prev, curr, "scene 4: role alternation at message {i}");
        }
    }

    // --- Roundtrip: OpenAI back to Anthropic ---

    let openai_req_for_roundtrip = TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer sk-oai-test".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "messages": [
                    { "role": "system", "content": "You are a helpful coding assistant." },
                    { "role": "user", "content": "What is a HashMap?" },
                    { "role": "assistant", "content": "A HashMap is a hash table based collection." },
                    { "role": "user", "content": "How do I iterate over it?" }
                ]
            }))
            .expect("scene 4: serialize OpenAI roundtrip request"),
        ),
    };

    let anthropic_back = openai_to_anthropic(&openai_req_for_roundtrip)?;
    let anthropic_body: serde_json::Value = serde_json::from_slice(&anthropic_back.body)
        .expect("scene 4: parse Anthropic roundtrip body");
    println!(
        "-> OpenAI -> Anthropic:\n{}\n",
        serde_json::to_string_pretty(&anthropic_body).unwrap()
    );

    assert_eq!(
        anthropic_back.path, "/v1/messages",
        "scene 4: roundtrip path"
    );
    assert_eq!(
        anthropic_body["system"], "You are a helpful coding assistant.",
        "scene 4: system prompt roundtrip"
    );
    // system message is extracted from messages[] into top-level "system" field
    // so we expect 3 messages (user, assistant, user)
    assert_eq!(
        anthropic_body["messages"].as_array().unwrap().len(),
        3,
        "scene 4: 3 messages after system extraction"
    );

    println!("✓ Scene 4: Multi-turn conversation passed\n");
    Ok(())
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() {
    println!("╔══════════════════════════════════════════════════════╗\n");
    println!("  Anthropic <-> OpenAI Chat Roundtrip\n");
    println!("╚══════════════════════════════════════════════════════╝\n");

    scene_1_simple_text().expect("scene 1 failed");
    scene_2_system_prompt().expect("scene 2 failed");
    scene_3_tool_use().expect("scene 3 failed");
    scene_4_multi_turn().expect("scene 4 failed");

    println!("══════════════════════════════════════════════════════");
    println!("  All 4 scenes passed!");
    println!("══════════════════════════════════════════════════════");
}

// 当前支持的非流式协议转换路径演示
//
// Run: cargo run --example all_transforms

use std::collections::HashMap;

use bytes::Bytes;
use llm_bridge_core::{
    model::{TransformRequest, TransformResponse},
    transform::{anthropic_to_openai, openai_to_anthropic},
};
use serde_json::json;

fn main() {
    // ─── 路径 1: Anthropic → OpenAI ──────────────────────────────────
    println!("=== 1. Anthropic → OpenAI ===");
    let req = anthropic_request();
    let resp = anthropic_to_openai(&req).unwrap();
    print_summary(&resp);

    // ─── 路径 2: OpenAI → Anthropic ──────────────────────────────────
    println!("\n=== 2. OpenAI → Anthropic ===");
    let req = openai_request();
    let resp = openai_to_anthropic(&req).unwrap();
    print_summary(&resp);
}

fn anthropic_request() -> TransformRequest {
    TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "ANTHROPIC_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 128,
                "system": "You are a helpful assistant.",
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "What is Rust?"}]
                    }
                ]
            }))
            .unwrap(),
        ),
    }
}

fn openai_request() -> TransformRequest {
    TransformRequest {
        headers: HashMap::from([
            ("authorization".to_string(), "Bearer OPENAI_KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o",
                "max_tokens": 256,
                "messages": [
                    { "role": "system", "content": "You are a helpful assistant." },
                    { "role": "user", "content": "What is Rust?" }
                ]
            }))
            .unwrap(),
        ),
    }
}

fn print_summary(resp: &TransformResponse) {
    println!("  路径: {}", resp.path);
    let body: serde_json::Value = serde_json::from_slice(&resp.body).unwrap();
    println!("  顶层键:");
    if let serde_json::Value::Object(map) = body {
        for key in map.keys() {
            println!("    - {key}");
        }
    }
}

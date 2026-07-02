// 错误处理模式演示
//
// Run: cargo run --example error_handling

use std::collections::HashMap;

use bytes::Bytes;
use llm_bridge_core::{
    model::{TransformError, TransformRequest},
    transform::{anthropic_to_openai, openai_to_anthropic},
};
use serde_json::json;

fn main() {
    // ─── 情况 1: 非法 JSON ─────────────────────────────────────────────
    println!("=== 1. 非法 JSON 请求体 ===");
    let req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/messages".to_string(),
        body: Bytes::from("not valid json {{{"),
    };

    match anthropic_to_openai(&req) {
        Ok(_) => unreachable!(),
        Err(TransformError::InvalidFormat(msg)) => {
            println!("✓ 预期 InvalidFormat 错误: {msg}");
        }
        Err(e) => println!("✗ 意外错误类型: {e:?}"),
    }

    // ─── 情况 2: 缺失必填字段 ──────────────────────────────────────────
    println!("\n=== 2. 缺失必填字段 ===");
    let req = TransformRequest {
        headers: HashMap::from([
            ("x-api-key".to_string(), "KEY".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 128,
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text"}] // 缺少 "text" 字段
                    }
                ]
            }))
            .unwrap(),
        ),
    };

    match anthropic_to_openai(&req) {
        Ok(_) => unreachable!(),
        Err(TransformError::MissingRequiredField(field)) => {
            println!("✓ 预期 MissingRequiredField 错误: {field}");
        }
        Err(e) => println!("✗ 意外错误类型: {e:?}"),
    }

    // ─── 情况 3: 空请求体 ─────────────────────────────────────────────
    println!("\n=== 3. 空请求体 ===");
    let req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::new(),
    };

    match openai_to_anthropic(&req) {
        Ok(_) => unreachable!(),
        Err(TransformError::InvalidFormat(msg)) => {
            println!("✓ 预期空请求体 InvalidFormat 错误: {msg}");
        }
        Err(e) => println!("✗ 意外错误类型: {e:?}"),
    }

    // ─── 情况 4: 缺失 messages 数组 ────────────────────────────────────
    println!("\n=== 4. 缺失 messages 数组 ===");
    let req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/chat/completions".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "gpt-4o"
                // "messages" 字段缺失
            }))
            .unwrap(),
        ),
    };

    match openai_to_anthropic(&req) {
        Ok(_) => unreachable!(),
        Err(TransformError::InvalidFormat(msg)) => {
            println!("✓ 预期 InvalidFormat 错误: {msg}");
        }
        Err(e) => println!("✗ 意外错误类型: {e:?}"),
    }

    println!("\n=== 所有错误情况均正确处理 ===");
}

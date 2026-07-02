// 基础非流式转换示例：Anthropic Messages API → OpenAI Chat Completions API
//
// Run: cargo run --example basic_nonstream

use std::collections::HashMap;

use bytes::Bytes;
use llm_bridge_core::{model::TransformRequest, transform::anthropic_to_openai};
use serde_json::json;

fn main() {
    // 构建 Anthropic 请求
    let input = TransformRequest {
        headers: HashMap::from([
            (
                "x-api-key".to_string(),
                "your-anthropic-api-key".to_string(),
            ),
            ("content-type".to_string(), "application/json".to_string()),
        ]),
        path: "/v1/messages".to_string(),
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 256,
                "system": "You are a helpful assistant.",
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

    // 转换为 OpenAI 格式
    let output = anthropic_to_openai(&input).expect("转换应成功");

    // 检查转换后的请求
    println!("=== 转换后的 OpenAI 请求 ===");
    println!("路径: {}", output.path);

    let auth = output.headers.get("authorization").unwrap();
    println!("鉴权头: {auth}");

    let out_body: serde_json::Value = serde_json::from_slice(&output.body).unwrap();
    println!(
        "请求体:\n{}",
        serde_json::to_string_pretty(&out_body).unwrap()
    );

    // 验证关键转换
    assert_eq!(output.path, "/v1/chat/completions");
    assert!(output.headers["authorization"].starts_with("Bearer "));
    assert_eq!(out_body["model"], "claude-sonnet-4-20250514");
    assert_eq!(out_body["messages"][0]["role"], "system");
    assert_eq!(out_body["messages"][1]["role"], "user");

    println!("\n=== 转换验证通过 ===");
    println!("✓ 路径: /v1/messages → /v1/chat/completions");
    println!("✓ 鉴权头: x-api-key → Bearer token");
    println!("✓ System: 顶层字段 → 第一条消息 (role=system)");
    println!("✓ 内容块: 数组格式 → 纯文本");
}

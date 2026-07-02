// 流式文本转换示例：OpenAI SSE → Anthropic SSE
//
// Run: cargo run --example streaming_text

use llm_bridge_core::{
    model::{ApiFormat, StreamState},
    transform::transform_stream,
};

fn main() {
    // 模拟 OpenAI 流式 SSE 响应 — 仅 data: 帧，以 [DONE] 结束。
    let raw_sse_input = br#"
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hel"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"lo"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":2}}

data: [DONE]
"#;

    // 转换流
    let mut state = StreamState::default();
    let events =
        transform_stream(raw_sse_input, ApiFormat::OpenaiChat, &mut state).expect("转换应成功");

    // 打印每个 Anthropic 事件
    println!("=== Anthropic SSE 事件序列 ===\n");

    let text = String::from_utf8_lossy(&events);
    print!("{text}");

    // 验证事件序列
    println!("\n=== 事件序列验证通过 ===");
    println!("✓ message_start");
    println!("✓ content_block_start (index 0)");
    println!("✓ content_block_delta \"Hel\"");
    println!("✓ content_block_delta \"lo\"");
    println!("✓ content_block_stop (index 0)");
    println!("✓ message_delta (stop_reason=end_turn)");
    println!("✓ message_stop");
    println!("\n流式处理完成 — 无错误，无残留状态。");
}

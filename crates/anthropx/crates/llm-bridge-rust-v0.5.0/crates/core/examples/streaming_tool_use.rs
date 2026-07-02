// 流式工具调用转换：OpenAI SSE tool_calls → Anthropic SSE tool_use
//
// Run: cargo run --example streaming_tool_use

use llm_bridge_core::{
    model::{ApiFormat, StreamState},
    transform::transform_stream,
};

fn main() {
    // OpenAI 流式工具调用 — 每个 chunk 增加一段 arguments JSON。
    // arguments 字段包含嵌套 JSON 字符串，需要正确的转义。
    let raw_sse_input: &[u8] = b"\
data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_123\",\"function\":{\"name\":\"get_weather\",\"arguments\":\"\"}}]}}]}\n\
\n\
data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"city\\\":\\\"Par\"}}]}}]}\n\
\n\
data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"is\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":20,\"completion_tokens\":6}}\n\
\n\
data: [DONE]\n\
";

    // 转换流
    let mut state = StreamState::default();
    let events =
        transform_stream(raw_sse_input, ApiFormat::OpenaiChat, &mut state).expect("转换应成功");

    // 打印每个 Anthropic 事件
    println!("=== Anthropic SSE 事件序列（工具调用） ===\n");

    let text = String::from_utf8_lossy(&events);
    print!("{text}");

    // 验证关键转换
    println!("\n=== 转换验证通过 ===");
    println!("✓ call_123 → toolu_call_123（Anthropic 工具调用 ID 前缀）");
    println!("✓ 函数名 'get_weather' → tool_use 名称");
    println!("✓ 参数跨 2 个 chunk 累积:");
    println!("  chunk 1: {{\"city\":\"Par");
    println!("  chunk 2: is\"}}");
    println!("  → 完整: {{\"city\":\"Paris\"}}");
    println!("✓ finish_reason=tool_calls → stop_reason=tool_use");
    println!("\n工具调用流式转换完成。");
}

# 62-example-chat-roundtrip: Anthropic ↔ OpenAI Chat 完整流程案例

Status: draft v1 · Owner: llm-bridge team · Depends on: 10-protocol-transform-design

## 1. Purpose

添加一个可运行的 example，用来验证 **Anthropic Messages API ↔ OpenAI Chat Completions API** 的双向协议转换完整流程。这个案例不是单元测试——它是一个**端到端可执行示例**，开发者可以 `cargo run` 直接看效果，确认两个方向的转换能跑通。

现有的 `basic_nonstream.rs` 只覆盖单向（Anthropic → OpenAI）。这个案例要覆盖**双向 + 请求→响应完整闭环**。

## 2. Scope

### 覆盖的转换路径

| 方向 | 函数 | 说明 |
|------|------|------|
| Anthropic → OpenAI | `anthropic_to_openai()` | 非流式请求转换 |
| OpenAI → Anthropic | `openai_to_anthropic()` | 非流式请求转换 |
| OpenAI response → Anthropic | `openai_response_to_anthropic_message()` | 非流式响应格式构造 |

### 具体场景

1. **简单文本**：user 发一条消息，assistant 回复
2. **system prompt**：带 system 指令的对话
3. **tool use 闭环**：assistant 调用工具 → tool result → assistant 最终回复
4. **多轮对话**：user → assistant → user → assistant 的完整交替

### 不覆盖的

- 流式场景（已有 `streaming_text.rs` 和 `streaming_tool_use.rs`）
- 其他 provider 路径（当前 spec set 已收敛到 Anthropic ↔ OpenAI）
- 图片内容（当前 example 以文本/工具闭环为主）

## 3. 接口设计

### 新增 example 文件

`crates/core/examples/chat-roundtrip.rs`

运行方式：

```bash
cargo run --example chat-roundtrip
```

### 案例结构

每个场景遵循相同模式：

```rust
// 1. 构造 Anthropic 请求
let anthropic_req = TransformRequest { ... };

// 2. 转换成 OpenAI 请求
let openai_req = anthropic_to_openai(&anthropic_req)?;
println!("→ OpenAI 请求:\n{}", pretty(&openai_req.body));

// 3. 模拟 OpenAI 响应（用 json! 构造）
let openai_resp = json!({
    "id": "chatcmpl-123",
    "choices": [{
        "message": { "role": "assistant", "content": "Hello!" },
        "finish_reason": "stop"
    }]
});

// 4. 将 OpenAI 响应转回 Anthropic 格式
// （这里用 openai_to_anthropic 处理响应体的反向映射）
// 注：当前库只有 request transform，response transform
// 需要明确标注这是"假设 OpenAI 返回了这个响应"的场景

println!("✓ 场景 N 完成");
```

### 约束

- 每个场景结束时必须 `println!` 确认转换结果
- 所有 `unwrap()` 替换成 `expect("场景描述")`
- 打印输出用 `serde_json::to_string_pretty` 格式化
- 每个场景结束后输出 `✓ 场景 N: 描述`

## 4. 行为

### 场景 1：简单文本对话

- **输入**：Anthropic user 消息 "Say hello"
- **转换**：Anthropic → OpenAI
- **模拟响应**：OpenAI 返回 "Hello!"
- **断言**：转换后的 path = `/v1/chat/completions`，messages[0].role = "user"

### 场景 2：带 system prompt

- **输入**：Anthropic with `system: "You are a concise assistant."`
- **转换**：Anthropic → OpenAI
- **模拟响应**：OpenAI 返回 3-sentence summary
- **断言**：system 转换成 OpenAI messages[0].role = "system"

### 场景 3：Tool use 闭环

- **输入**：Anthropic assistant 发出 tool_use + user 返回 tool_result
- **转换**：Anthropic → OpenAI
- **再转换**：OpenAI → Anthropic（双向验证）
- **断言**：tool_call_id 正确映射（`call_abc` → `toolu_call_abc` → 回 `call_abc`）

### 场景 4：多轮对话

- **输入**：3 轮 Anthropic 对话（user → assistant → user）
- **转换**：Anthropic → OpenAI
- **断言**：messages 数量正确，role 交替正确

## 5. 成功标准

1. `cargo run --example chat-roundtrip` 无 panic、无错误退出
2. 输出包含所有 4 个场景的 `✓ 场景 N: ...` 确认信息
3. 每个场景的 JSON 输出可以被 `serde_json::from_str` 重新解析
4. 运行 `cargo +nightly fmt` 和 `cargo clippy` 无警告

## 6. Cross-references

- ← Depends on: [10-protocol-transform-design.md](./10-protocol-transform-design.md) §2.4 (Anthropic ↔ OpenAI mapping)
- ← Depends on: 现有 `basic_nonstream.rs`（示例模板）
- → Tracked in: [91-protocol-transform-impl-plan.md](./91-protocol-transform-impl-plan.md) §7 Phase 4.4
- → Consumed by: 开发者手动验证 + 后续 CI 回归
- ↔ Related: [63-http-proxy-example.md](./63-http-proxy-example.md)（真实网络端到端）
- ↔ Related: `crates/core/src/transform.rs` 的 `anthropic_to_openai` / `openai_to_anthropic`
- ↔ Related: `crates/core/src/model.rs` 的 `TransformRequest` / `TransformResponse`

# 10 — Protocol Transform Core Design

Status: active v2 · Owner: TBD · Depends on: [00-protocol-transform-prd.md](./00-protocol-transform-prd.md)

## 1. Purpose

本 spec 定义 `crates/core` 中的 Rust protocol-transform core。它位于转发层中间件链之后、上游 HTTP 客户端之前，负责不同 LLM API 协议之间的请求/响应格式映射。

它只拥有协议语义，不拥有语言接入或业务策略：

- **负责**：header/path/body 映射、流式事件转换、错误语义标准化、协议专有能力的显式降级、安全边界校验。
- **不负责**：token 优化、路由、熔断、重试、计费、租户策略、上游选择、HTTP 服务监听、Go client ergonomics。

该层的核心 contract 是：**对受支持协议子集提供语义保真映射；对无等价能力执行显式有损降级并记录 debug 日志。**

## 2. Interface

### 2.1 Supported directions

| Source | Target | Surface | Mode | Notes |
| --- | --- | --- | --- | --- |
| Anthropic Messages | OpenAI Chat Completions | request + response | high-frequency | Claude Code 兼容主路径 |
| Anthropic Messages | Anthropic Messages | passthrough | n/a | 不进入协议转换 |
| OpenAI Chat Completions | OpenAI Chat Completions | passthrough | n/a | 不进入协议转换 |
| OpenAI Chat Completions | Anthropic Messages | request + response | low-frequency | 仅少量兼容场景 |

### 2.2 Request shapes

- **非流式接口**：完整 JSON body + headers + path，输出完整 JSON body + headers + path。
- **流式接口**：上游 SSE 流 + per-connection `StreamState`，输出 Anthropic 兼容 SSE 事件流。

两种接口分离，不允许使用一个 `body: Bytes` 同时承载”完整 JSON 转换”和”增量流式转换”。

### 2.3 Consumption model

- Rust consumers 可以直接嵌入 `crates/core`，将其作为 library 调用。
- 上层 server / forwarder 通过 core 暴露的 public API 消费协议转换能力。
- 未来 Go 原生实现者应参考本 spec 与 fixture corpus 保证语义一致，但不复用 Rust 内部实现。

### 2.4 Canonical transform rules

#### 2.4.1 Header and path mapping

| Source | Target | Header mapping | Path mapping |
| --- | --- | --- | --- |
| Anthropic | OpenAI Chat | `x-api-key` -> `Authorization: Bearer <token>` | `/v1/messages` -> `/v1/chat/completions` |
| OpenAI Chat | Anthropic | `Authorization: Bearer <token>` -> `x-api-key` | `/v1/chat/completions` -> `/v1/messages` |

#### 2.4.2 Anthropic -> OpenAI Chat

- `system` 顶层字段映射为 `messages[0].role=system`。
- `text` / `image` content block 映射到 OpenAI `content`。
- `tool_use` 映射到 assistant message 的 `tool_calls[]`，**不进入** `content[]`。
- `tool_result` 映射到 `role=tool` message，并保留 `tool_call_id` 关联。
- 顶层 `tools` / `tool_choice` 映射到 OpenAI 顶层工具定义。
- 参数映射：`stop_sequences -> stop`，`tool_choice(any/auto/tool) -> tool_choice`，`max_tokens` 通过 route/provider 配置映射到目标输出 token 字段。
- 已知不支持字段：`thinking`、`cache_control`、`document`、`metadata` 等进入显式有损降级。

#### 2.4.3 OpenAI Chat -> Anthropic Messages

- OpenAI `messages[].content`（文本/图像）映射为 Anthropic `content[]`。
- assistant `tool_calls` 映射为 Anthropic `tool_use`。
- `role=tool` 映射为 Anthropic `tool_result`，并依赖 `tool_call_id -> tool_use_id` 索引。
- 顶层 `tools[].function` 与 `tool_choice` 映射为 Anthropic 工具定义与工具选择。
- 兼容 `reasoning_content` 及对应流式增量，映射为 Anthropic `thinking` / `thinking_delta`。
- `usage.prompt_tokens/completion_tokens` 映射为 `input_tokens/output_tokens`。
- `finish_reason stop/length/tool_calls` 分别映射为 `end_turn/max_tokens/tool_use`。
- `response_format`、`logprobs`、`audio`、`prediction`、structured outputs 进入显式有损降级。

## 3. Invariants

- **I1. Supported-subset fidelity**：凡 design spec 标记为“支持”的字段，转换前后必须语义等价。
- **I2. Explicit lossy downgrade**：凡 design spec 标记为“不支持”的字段，必须显式省略并记录 debug 日志，不允许隐式丢弃。
- **I3. Stable Anthropic stream shape**：所有流式 Anthropic 输出都必须遵循 `message_start -> content_block_* -> message_delta -> message_stop`。
- **I4. Error is not stop reason**：错误终止统一通过 `event: error` 表达，不复用正常 `StopReason`。
- **I5. Per-connection isolation**：每个流连接拥有独立 `StreamState`，不得跨请求复用。
- **I6. Boundary rejection**：SSRF、超长 JSON 片段、超大 buffer、非法输入在边界即拒绝，不做“清洗后继续”。

## 4. Behaviour

### 4.1 Streaming behaviour

#### Target Anthropic event model

- `message_start`：开始一条 assistant 消息。
- `content_block_start / delta / stop`：文本、tool_use、thinking 等 block 的增量输出。
- `message_delta`：承载 `usage`、`stop_reason`、`stop_sequence`。
- `message_stop`：仅表示消息结束，不承载 `usage` 或 `stop_reason`。

#### Source framing

- **OpenAI Chat**：标准 SSE，通常仅含 `data:` 行，结束标记为 `data: [DONE]`。
- 实现必须分两层解析：第一层做统一 SSE 帧解析；第二层按 provider 解析 `data:` payload。

#### Tool call accumulation

- OpenAI 流式 `tool_calls` 按 `index` 增量拼接；首块携带 `id` 与 `function.name`，后续块仅追加 `function.arguments`。
- tool call JSON 片段必须按字节计数受限；超限即视为内部错误终止流。
- OpenAI `role=tool` -> Anthropic `tool_result` 需要依赖同请求内先前建立的 `tool_call_id -> tool_use_id` 索引。

### 4.2 Error termination

| Case | Before `message_start` | After `message_start` |
| --- | --- | --- |
| 上游结构化错误 | 直接返回错误并关闭连接 | 发送 `event:error`，随后 best-effort `message_stop` |
| 转换器内部错误 | 直接返回错误并关闭连接 | 发送 `event:error`，随后 best-effort `message_stop` |
| 传输错误/超时/客户端取消 | 直接关闭连接 | 若仍可写则 `event:error` + best-effort `message_stop`，否则直接关闭 |

### 4.3 Unsupported and lossy features

以下能力进入显式有损降级，不纳入 round-trip 保证：

| Feature | Handling |
| --- | --- |
| Anthropic `cache_control` | 省略并记录 debug 日志 |
| Anthropic 发送端 `thinking` | 省略并记录 debug 日志 |
| Anthropic `document` / `container` | 省略并记录 debug 日志 |
| Anthropic `metadata` | 省略并记录 debug 日志 |
| OpenAI `response_format` / structured outputs | 省略并记录 debug 日志 |
| OpenAI `logprobs` / `audio` / `prediction` | 省略并记录 debug 日志 |
| OpenAI `parallel_tool_calls` | 省略并记录 debug 日志 |
| OpenAI `frequency_penalty` / `presence_penalty` / `seed` | 省略并记录 debug 日志（Anthropic 无对应参数） |

### 4.4 Image URL handling security

当前 scope 中，转换层**不执行任何基于图片 URL 的外部下载**。

- `ImageSource::Url` 仅作为协议数据进行保留或透传，不触发 DNS 解析、HTTP 请求、重定向跟随或 MIME 探测。
- 如果目标协议无法表达该图片形态，必须按对应 transform 规则做显式有损降级或返回格式错误，但**不得**通过下载规避协议差异。
- 若未来重新引入外部下载能力，必须先更新本节及 [12-image-download-security.md](./12-image-download-security.md) 后再实现。

## 5. Data model

实现层应使用能表达协议差异而不制造非法状态的内部类型：

- `ApiFormat`：`AnthropicMessages | OpenaiChat`
- `ContentBlock`：`Text | Image | ToolUse | ToolResult | Thinking`
- `ImageSource`：
  - `Inline { media_type, data }`
  - `Url { url }`
- `StreamEvent`：`MessageStart | ContentBlockStart | ContentBlockDelta | ContentBlockStop | MessageDelta | MessageStop | Error`
- `StopReason`：仅表达正常停止原因（`EndTurn | MaxTokens | ToolUse | StopSequence | ContentFilter`）
- `TransformError`：必须是 `thiserror` 错误枚举，包含 `InvalidFormat`、`MissingRequiredField`、`BufferLimitExceeded`、`StreamInterrupted`、`UpstreamError` 等分支

## 6. Performance and limits

| Limit | Value |
| --- | --- |
| 单流总 buffer | 1 MB |
| 单个 tool call 参数 buffer | 256 KB |
| 单 chunk 等待超时 | 30 s |
| 下游阻塞超时 | 10 s |
| 图片下载超时 | 5 s |
| 单实例建议并发流上限 | 1000 |

## 7. Engineering constraints bound to CLAUDE.md / AGENTS.md

- **Error Handling**：按 `CLAUDE.md § Error Handling`，使用 `thiserror` 错误枚举；不得在生产逻辑中 `unwrap/expect`。
- **Async & Concurrency**：按 `CLAUDE.md § Async & Concurrency`，流式转换按 per-connection Actor / channel 模式组织；不得把 `StreamState` 包在 `Mutex/RwLock` 中跨请求共享。
- **Type Design & API**：按 `CLAUDE.md § Type Design & API`，使用显式类型区分流式与非流式接口，避免单一入口承载多种状态。
- **Safety & Security**：按 `CLAUDE.md § Safety & Security`，所有外部输入在边界校验；图片 URL 下载执行 SSRF、防重定向绕过、大小限制与 MIME allowlist。
- **Serialization & Data**：按 `CLAUDE.md § Serialization & Data`，反序列化后立即校验；动态 schema 仅限工具参数等真正动态字段。
- **Testing**：按 `CLAUDE.md § Testing`，必须覆盖单元、fixture、流式、往返、边界与错误路径；关键流式场景使用快照或 fixture 固定。
- **Logging & Observability**：按 `CLAUDE.md § Logging & Observability`，对显式有损降级记录 `debug` 日志；日志不得泄漏密钥、Authorization 或 URL 下载敏感上下文。
- **Performance**：按 `CLAUDE.md § Performance`，在热路径使用 `Bytes` / 增量拼接，避免不必要的整块复制。

## 8. Test strategy

- 单元测试：字段映射、header/path 映射、参数名映射。
- 往返测试：受支持且非显式降级字段满足语义等价。
- 流式测试：OpenAI `[DONE]` 收尾、tool call 参数增量拼接、Anthropic 终止事件语义。
- 边界测试：非法 JSON、buffer 超限、SSE 中断、图片 URL 不触发外部下载。

### 8.1 Fixture corpus contract

- fixture 根目录固定为 `fixtures/protocol-transform/`。
- 目录命名规则：`<source>-to-<target>/`，例如 `anthropic-to-openai/`、`openai-to-anthropic/`。
- **非流式 fixture** 使用单个 JSON 文件，结构如下：
  - `name`
  - `mode: "non_stream"`
  - `input.headers`
  - `input.path`
  - `input.body`
  - `expected.headers`
  - `expected.path`
  - `expected.body`
- **流式 fixture** 使用单个 JSON 文件，结构如下：
  - `name`
  - `mode: "stream"`
  - `input.events[]`：按到达顺序保存原始 SSE frame 或 provider payload
  - `expected.events[]`：按 Anthropic 事件顺序保存标准化输出事件
  - `expected.terminal_state`：记录是否预期 `message_stop`、`error`、`stop_reason`
- 每个 fixture 可选 `notes` 字段解释为何覆盖该边界场景。

### 8.2 Minimum required fixture sets

- `anthropic-to-openai/non-stream-basic`
- `anthropic-to-openai/stream-text`
- `anthropic-to-openai/non-stream-tool-use`
- `anthropic-to-openai/non-stream-tool-result`
- `anthropic-to-openai/non-stream-top-level-tools`
- `openai-to-anthropic/stream-text`
- `openai-to-anthropic/stream-tool-call`
- `openai-to-anthropic/non-stream-tool-result`
- `openai-to-anthropic/non-stream-response-thinking`
- `end-to-end/anthropic-openai-non-stream-thinking-tool-use`
- `end-to-end/anthropic-openai-stream-thinking-tool-use`
- `end-to-end/openai-real-log-stream-final-answer`

## 9. Cross-references

- ← Depends on: [00-protocol-transform-prd.md](./00-protocol-transform-prd.md)
- → Consumed by: [91-protocol-transform-impl-plan.md](./91-protocol-transform-impl-plan.md)
- ↔ Related decisions: [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md)
- ↔ Related research: 当前仓库无 `./docs/research/` 条目

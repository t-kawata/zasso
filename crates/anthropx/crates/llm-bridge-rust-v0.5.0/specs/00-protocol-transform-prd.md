# PRD — Protocol Transform Core

Status: draft v2 · Owner: TBD · Last updated: 2026-05-18

## 1. Problem

`llm-bridge` 需要服务多种客户端协议与上游 provider 协议。当前如果没有一个明确的协议转换 core，后续实现会同时发生漂移：

- 请求/响应字段映射靠局部判断，导致同一语义在不同路径下表现不一致。
- 流式响应缺少统一状态机，容易出现 tool call 参数拼接错误、终止事件错序、usage 丢失。
- 协议专有能力（如 thinking、cache_control、tool call 终止语义）如果不显式定义降级策略，会演变成隐式丢字段。
- 图片 URL 这类跨协议内容如果没有明确 handling contract，会在不同路径产生不一致行为，甚至引入额外副作用。

问题的本质不是"把 JSON 改个名字"。真正要建立的是：

- 一个 Rust core，作为唯一的协议与流式语义 contract
- 后续所有消费路径（Rust 内嵌、未来 Go 原生实现）都复用同一套语义

## 2. Vision

`llm-bridge` 应当成为一个**Rust core 驱动、语义 contract 唯一、可扩展到更多语言**的桥接系统：

- Rust core 对受支持的协议子集提供语义等价转换；
- 对无等价能力，明确有损降级而非静默处理；
- 对流式响应，稳定产出 Anthropic 兼容的事件序列；
- 对安全风险输入，在边界即拒绝。

长远目标：

- Rust 消费者可以直接嵌入 `crates/core`
- 未来 Go 原生实现作为独立项目，复用同一套协议语义 contract
- 无论消费路径是什么，协议行为都一致

## 3. Goals

| # | Goal | Measure |
| --- | --- | --- |
| G1 | 为 Anthropic ↔ OpenAI Chat 建立统一转换 contract | 协议映射、错误语义、流式语义全部在 Rust core design 中有唯一权威定义 |
| G2 | Rust core 提供清晰的 library API | `crates/core` 的公共 API 稳定，可被任何 Rust consumer 直接嵌入 |
| G3 | 保证 Anthropic 兼容流式输出稳定 | 目标事件序列固定为 `message_start -> content_block_* -> message_delta -> message_stop`，关键场景具备 fixture 测试 |
| G4 | 把安全边界前置到设计层 | 图片 URL 处理、buffer 限额、超时、终止策略均有明确规范，可被测试固定 |

## 4. Non-goals

- 不负责 token 压缩、prompt 裁剪、上下文整理。
- 不负责路由、熔断、重试、计费、租户策略。
- 不试图在 v1 支持所有 provider 专有扩展能力。
- **v1 不提供任何语言 bridge**（不引入 bridge server、cgo、FFI）；Go 原生实现在后续阶段独立推进。
- 不承诺协议字节级可逆；仅对受支持子集承诺语义保真。

## 5. Users

- **Primary**：实现 `crates/core` 的 Rust 工程师，需要明确知道协议、流式、错误和安全 contract 如何落地。
- **Primary**：上层 forwarder / server 维护者，需要将 core 作为 library 嵌入到请求处理链路中。
- **Secondary**：评审者与后续维护者，需要在不读聊天记录的前提下理解协议转换的完整 contract。
- **Secondary**：未来 Go 原生实现者，需要一份语言无关的语义 spec 来保证与 Rust core 一致。

## 6. Success metrics

- Rust core 的 `Anthropic -> OpenAI Chat` 与 `OpenAI -> Anthropic` fixture 测试全部通过。
- 非流式与流式路径均具备稳定的 library API，可被上层 server 直接调用。
- `Anthropic -> OpenAI` 与 `OpenAI -> Anthropic` 两条主路径具备明确 fixture 与退出标准。
- 设计文档中的"不支持特性清单"与实现中的 debug 日志 / 错误行为一一对应。
- 关键异常路径（JSON 不完整、buffer 超限、SSE 中断、图片 URL handling 边界）均可通过自动化测试复现。

## 7. Naming conventions (binding)

- 规范名称统一使用：`Anthropic Messages`、`OpenAI Chat Completions`、`Rust core`。
- 规范文件命名使用：`<number>-<topic>-<type>.md`。
- 后续实现中的核心术语保持与 design spec 一致：`ApiFormat`、`ContentBlock`、`ImageSource`、`StreamEvent`、`StopReason`、`TransformError`。

## 8. Cross-references

- → Defined by: [10-protocol-transform-design.md](./10-protocol-transform-design.md)
- → Planned by: [90-protocol-transform-roadmap.md](./90-protocol-transform-roadmap.md), [91-protocol-transform-impl-plan.md](./91-protocol-transform-impl-plan.md)
- ↔ Related decisions: [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md)

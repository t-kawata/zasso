# 90 — Protocol Transform Roadmap

Status: active v4 · Owner: TBD · Depends on: [00-protocol-transform-prd.md](./00-protocol-transform-prd.md), [10-protocol-transform-design.md](./10-protocol-transform-design.md)

## 0. Principles

- **Always shippable**：每个里程碑结束后，当前已支持路径都必须保持稳定，不允许后续里程碑修前面里程碑的基本协议契约。
- **Contract first**：每个里程碑只扩展在 design spec 中已经冻结的 contract，不引入未记录的特例路径。
- **Honest scope**：里程碑按用户可见能力命名，不按内部模块命名。
- **Core first**：先交付完整的 Rust core library，再考虑语言扩展。

## 1. Build-order graph

```text
00-prd -> 10-design
10-design -> 99-decisions
10-design -> 90-roadmap
10-design -> 91-impl-plan
```

## 2. Milestones

### M0 — Rust core 非流式主路径可用

**Specs touched**：00, 10, 99, 91

**User-visible outcome**：Rust 消费者可以直接调用 `crates/core` 跑通 Anthropic-compatible 到 OpenAI Chat 的非流式主路径。

**Exit criteria**：

- Anthropic -> OpenAI 非流式 fixture 全部通过
- 不支持字段均落入显式降级清单与 debug 日志
- 非流式错误路径（非法 JSON、缺字段）有稳定错误输出
- `crates/core` 作为 library 可被直接嵌入，无 bridge server 依赖

### M1 — 流式转换核心可用

**Specs touched**：10, 90, 91, 99

**User-visible outcome**：`crates/core` 支持 OpenAI → Anthropic 的流式转换，产出稳定的 Anthropic 兼容 SSE 事件序列。

**Exit criteria**：

- `message_start -> content_block_* -> message_delta -> message_stop` 序列稳定
- OpenAI `[DONE]` 收尾与分片增量测试通过
- tool call 参数增量拼接正确
- 错误终止语义（`event:error` + best-effort `message_stop`）正确

### M2 — Provider compatibility 扩展完成

**Specs touched**：10, 90, 91, 99

**User-visible outcome**：Rust core 具备完整的 Anthropic ↔ OpenAI 兼容能力，包括工具调用、thinking/reasoning 与端到端 fixture 覆盖。

**Exit criteria**：

- OpenAI -> Anthropic 非流式与流式 fixture 通过
- Anthropic -> OpenAI 顶层 `tools` / `tool_choice` 映射稳定
- `reasoning_content` -> Anthropic `thinking` / `thinking_delta` 映射通过真实与合成样本验证
- `tool_call_id -> tool_use_id` 关联稳定
- `usage` 与 `finish_reason` 映射符合 design spec
- 关键 end-to-end / real-log fixtures 通过

### M3 — Hardening 与质量门收敛

**Specs touched**：10, 90, 91

**User-visible outcome**：协议转换层达到可合并、可迭代扩展的质量状态。

**Exit criteria**：

- fixture / snapshot / round-trip / edge tests 全绿
- build / test / fmt / clippy 通过
- 实现行为与 design spec 一致，不存在未记录的 provider 特例

### M4 — OpenAI Responses API 支持

**Specs touched**：待新增 Responses API design spec

**User-visible outcome**：`crates/core` 支持 OpenAI Responses API 与 Anthropic Messages API 之间的双向转换，包括非流式请求/响应与流式 SSE 转换。

**Exit criteria**：

- Anthropic → OpenAI Responses 非流式 fixture 全部通过
- Anthropic SSE → OpenAI Responses SSE 流式转换通过
- OpenAI Responses → Anthropic 非流式 fixture 全部通过
- OpenAI Responses SSE → Anthropic SSE 流式转换通过
- Responses API 特有字段（如 `response_id`, `output` 数组结构）正确映射
- 不支持字段均落入显式降级清单与 debug 日志

## 3. Future milestones (not in current scope)

### M-Go — Go 原生实现

**Specs**：待独立定义

**User-visible outcome**：Go 原生实现的 protocol-transform library，语义行为与 Rust core 的 fixture corpus 一致。

**Notes**：

- Go 实现应参考本 spec set 与 `fixtures/protocol-transform/` 中的测试语料
- Go 实现可以独立开发，不依赖 Rust 代码，但语义上必须与 Rust core 的 fixture 保持一致
- 不在 v1 中引入 bridge server、cgo 或 FFI

## 4. Cross-references

- ← Depends on: [00-protocol-transform-prd.md](./00-protocol-transform-prd.md), [10-protocol-transform-design.md](./10-protocol-transform-design.md)
- → Consumed by: [91-protocol-transform-impl-plan.md](./91-protocol-transform-impl-plan.md)
- ↔ Related decisions: [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md)

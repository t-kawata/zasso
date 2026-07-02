# 91 — Protocol Transform Implementation Plan

Status: active v3 · Owner: TBD · Depends on: [10-protocol-transform-design.md](./10-protocol-transform-design.md), [90-protocol-transform-roadmap.md](./90-protocol-transform-roadmap.md), [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md)

## 0. Readiness assessment

已完成（Phase 0）：

- `docs/research/` 下的 prior-art memo
- 按 [10 §8.1](./10-protocol-transform-design.md#81-fixture-corpus-contract) 固定格式生成的 fixture 语料
- 与真实 provider 行为对齐的回归样本
- 显式有损降级清单与 debug 日志策略
- 图片 URL handling 的安全 contract

当前状态：Phase 1-5 全部完成。Spec 92（Usage 缓存/推理 token 字段扩展）已实现。

## 1. Why dependency order != feature order

- 用户最先感知的是"Claude Code / Codex 能不能打到目标上游"，但工程上必须先落地内部数据模型与错误语义，否则每条路径都会用自己的局部约定。
- 用户最关心文本能否流出来，但工程上必须先固定 `StreamEvent` 与终止语义，否则 tool_use、usage、error 顺序都会返工。
- 图片 URL 处理看似只是边角能力，但如果 contract 不清晰，就会在不同路径产生隐式副作用或不一致行为。

## 2. Estimated total effort

以单人连续投入估算：**4–5 周**。

- Phase 0：1–2 天
- Phase 1：3–4 天
- Phase 2：3–4 天
- Phase 3：4–5 天
- Phase 4：2–3 天
- Phase 5：5–6 天

前提：不新增 provider，不引入 bridge server，不要求 Go 原生实现同步推进。

## 3. Phase 0 — risk retirement

| # | Deliverable | Spec | Effort |
| --- | --- | --- | --- |
| 0.1 | 按 [10 §8.1](./10-protocol-transform-design.md#81-fixture-corpus-contract) 固定 fixture 目录与 schema | [10 §8.1](./10-protocol-transform-design.md#81-fixture-corpus-contract) | 0.5d |
| 0.2 | 收集 Anthropic/OpenAI 非流式与流式样本 fixture | [10 §8.2](./10-protocol-transform-design.md#82-minimum-required-fixture-sets) | 0.5d |
| 0.3 | 冻结显式有损降级清单与 debug 日志策略 | [10 §4.3](./10-protocol-transform-design.md#43-unsupported-and-lossy-features) | 0.5d |
| 0.4 | 确认图片 URL handling 的安全 contract | [10 §4.4](./10-protocol-transform-design.md#44-image-url-handling-security) | 0.5d |

**Exit gate**：fixture corpus 可直接驱动实现；不支持特性清单不再口头约定；安全边界可以写成测试。该阶段为后续所有 milestone 的风险退役前置条件。

## 4. Phase 1 — Rust core foundation

| # | Task | Spec | Effort |
| --- | --- | --- | --- |
| 1.1 | 定义 `ApiFormat` / `ContentBlock` / `ImageSource` / `StopReason` / `TransformError` | [10 §5](./10-protocol-transform-design.md#5-data-model) | 1d |
| 1.2 | 拆分非流式与流式入口类型 | [10 §2.2](./10-protocol-transform-design.md#22-request-shapes) | 0.5d |
| 1.3 | 实现 Anthropic -> OpenAI 的 header/path/body 映射骨架 | [10 §2.4.1](./10-protocol-transform-design.md#241-header-and-path-mapping), [10 §2.4.2](./10-protocol-transform-design.md#242-anthropic---openai-chat) | 1d |
| 1.4 | 加入边界校验与错误类型落位 | [10 §3](./10-protocol-transform-design.md#3-invariants) | 1d |

**Exit criteria**：非流式主路径可跑通 fixture；错误类型覆盖非法 JSON、缺字段、显式降级；核心内部类型不再改名。该阶段关闭 [90 §M0](./90-protocol-transform-roadmap.md#m0--rust-core-非流式主路径可用)。

## 5. Phase 2 — streaming spine

| # | Task | Spec | Effort |
| --- | --- | --- | --- |
| 2.1 | 实现统一 SSE framing parser | [10 §4.1](./10-protocol-transform-design.md#41-streaming-behaviour) | 1d |
| 2.2 | 实现 OpenAI streaming payload parser | [10 §4.1](./10-protocol-transform-design.md#41-streaming-behaviour) | 1d |
| 2.3 | 实现 per-connection `StreamState` 与事件累积 | [10 §3](./10-protocol-transform-design.md#3-invariants) | 1d |
| 2.4 | 实现 `message_delta` / `message_stop` / `error` 终止规则 | [10 §4.1](./10-protocol-transform-design.md#41-streaming-behaviour), [10 §4.2](./10-protocol-transform-design.md#42-error-termination) | 1d |

**Exit criteria**：Anthropic 目标事件序列稳定；OpenAI `[DONE]` 与增量拼接测试通过；错误不会错误复用 `StopReason`。该阶段关闭 [90 §M1](./90-protocol-transform-roadmap.md#m1--流式转换核心可用)。

## 6. Phase 3 — provider compatibility expansion

| # | Task | Spec | Effort |
| --- | --- | --- | --- |
| 3.1 | 实现 OpenAI -> Anthropic 的 auth/path/body 映射 | [10 §2.4.1](./10-protocol-transform-design.md#241-header-and-path-mapping), [10 §2.4.3](./10-protocol-transform-design.md#243-openai-chat---anthropic-messages) | 1d |
| 3.2 | 完成 OpenAI `tool_calls`、`role=tool` 与 `tool_call_id -> tool_use_id` 映射 | [10 §2.4.3](./10-protocol-transform-design.md#243-openai-chat---anthropic-messages), [10 §4.1](./10-protocol-transform-design.md#41-streaming-behaviour) | 1d |
| 3.3 | 实现 `reasoning_content` 与对应流式增量到 Anthropic `thinking` 的映射 | [10 §2.4.3](./10-protocol-transform-design.md#243-openai-chat---anthropic-messages), [10 §4.1](./10-protocol-transform-design.md#41-streaming-behaviour) | 1d |
| 3.4 | 补齐 Anthropic -> OpenAI 请求侧工具定义与 `tool_choice` 映射 | [10 §2.4.2](./10-protocol-transform-design.md#242-anthropic---openai-chat) | 1d |
| 3.5 | 建立 end-to-end 与 real-log fixture 覆盖关键代理链路 | [10 §8](./10-protocol-transform-design.md#8-test-strategy) | 1d |

**Exit criteria**：Anthropic ↔ OpenAI 兼容路径稳定；thinking/tool-use/tool-result 关键映射稳定；真实日志 fixture 可回归；图片 URL handling 不引入外部下载副作用。该阶段关闭 [90 §M2](./90-protocol-transform-roadmap.md#m2--provider-compatibility-扩展完成)。

## 7. Phase 4 — verification and polish

| # | Task | Spec | Effort |
| --- | --- | --- | --- |
| 4.1 | 完整补 fixture / snapshot / round-trip / edge tests | [10 §8](./10-protocol-transform-design.md#8-test-strategy) | 1d |
| 4.2 | 补 tracing / metrics / debug logs for lossy paths | [10 §7](./10-protocol-transform-design.md#7-engineering-constraints-bound-to-claudemd--agentsmd) | 0.5d |
| 4.3 | 执行 build/test/fmt/clippy 并收敛实现细节 | [00 §3](./00-protocol-transform-prd.md#3-goals) | 1d |
| 4.4 | 添加 `chat-roundtrip` example：4 场景端到端验证 Anthropic ↔ OpenAI 双向转换闭环 | [62 §2–4](./62-example-chat-roundtrip.md#2-scope) | 0.5d |
| 4.5 | 添加 `http-proxy` example：启动 HTTP 服务，Anthropic → OpenAI 真实网络代理（非流式 + SSE） | [63 §2–4](./63-http-proxy-example.md#2-scope) | 1d |

**Exit criteria**：关键 fixture 全绿；质量门通过；实现行为与 design spec 一致，不存在未记录特例；`cargo run --example chat-roundtrip` 无 panic 输出全部 4 个场景确认；`cargo run --example http-proxy` 启动后可用 curl/SDK 打到上游拿到真实响应。该阶段关闭 [90 §M3](./90-protocol-transform-roadmap.md#m3--hardening-与质量门收敛)。

## 8. Phase 5 — OpenAI Responses API

| # | Task | Spec | Effort |
| --- | --- | --- | --- |
| 5.1 | 定义 OpenAI Responses API 请求/响应类型映射 | 待新增 Responses design spec | 1d |
| 5.2 | 实现 Anthropic → OpenAI Responses 非流式转换 | 待新增 Responses design spec | 1d |
| 5.3 | 实现 Anthropic SSE → OpenAI Responses SSE 流式转换 | 待新增 Responses design spec | 1d |
| 5.4 | 实现 OpenAI Responses → Anthropic 非流式转换 | 待新增 Responses design spec | 1d |
| 5.5 | 实现 OpenAI Responses SSE → Anthropic SSE 流式转换 | 待新增 Responses design spec | 1d |
| 5.6 | 添加 Responses API fixture 覆盖 | [10 §8](./10-protocol-transform-design.md#8-test-strategy) | 1d |

**Exit criteria**：Anthropic ↔ OpenAI Responses API 兼容路径稳定；非流式与流式 fixture 全绿；Responses API 特有字段正确映射；降级行为符合 design spec。该阶段关闭 [90 §M4](./90-protocol-transform-roadmap.md#m4--openai-responses-api-支持)。

## 9. What makes this order correct

- **先锁 core contract。** 所有消费路径要消费的是稳定语义，而不是未冻结的内部实现。
- **先建立 non-stream，再补 streaming。** 这样主路径能尽早可用，同时不在早期把流式复杂度压入基础层。
- **先把安全约束编码到 core。** 图片 URL handling 这类边界逻辑如果在后续语言实现中分叉，就会形成行为漂移甚至安全漏洞。

## 10. Cross-references

- ← Depends on: [10-protocol-transform-design.md](./10-protocol-transform-design.md), [90-protocol-transform-roadmap.md](./90-protocol-transform-roadmap.md), [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md)
- ↔ Related PRD: [00-protocol-transform-prd.md](./00-protocol-transform-prd.md)
- ↔ Related specs: [62-example-chat-roundtrip.md](./62-example-chat-roundtrip.md) (Phase 4.4), [63-http-proxy-example.md](./63-http-proxy-example.md) (Phase 4.5)

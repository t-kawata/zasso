# Protocol Transform Core Spec Index

Status: draft v2 · Last updated: 2026-05-22

## 1. Scope

本 spec set 定义 `llm-bridge` 的协议转换方案：

- `crates/core` 中的 Rust protocol-transform core

当前阶段聚焦于 Rust core 的完整实现。Go 原生实现在后续阶段独立推进。

## 2. Spec table

| File | Type | Purpose |
| --- | --- | --- |
| [00-protocol-transform-prd.md](./00-protocol-transform-prd.md) | PRD | 说明为什么要做 protocol-transform core、服务谁、成功标准是什么 |
| [10-protocol-transform-design.md](./10-protocol-transform-design.md) | Core design | 定义 Rust protocol-transform core 的协议映射、流式状态机、错误语义与安全约束 |
| [13-responses-previous-response-id-design.md](./13-responses-previous-response-id-design.md) | Interface design | 定义 `Responses previous_response_id` 的接口边界，明确其属于 proxy/caller 层而非 core transform |
| [11-lossy-downgrade-checklist.md](./11-lossy-downgrade-checklist.md) | Checklist | 冻结显式有损降级字段清单与 debug 日志策略，实现时逐项对照 |
| [12-image-download-security.md](./12-image-download-security.md) | Security contract | 定义图片 URL 在当前 scope 下的处理边界与“禁止外部下载”约束 |
| [62-example-chat-roundtrip.md](./62-example-chat-roundtrip.md) | Example | Anthropic ↔ OpenAI Chat 完整流程可执行案例（内存级 mock） |
| [63-http-proxy-example.md](./63-http-proxy-example.md) | Example | 可运行的 HTTP/SSE proxy 服务器，端到端真实网络链路 |
| [90-protocol-transform-roadmap.md](./90-protocol-transform-roadmap.md) | Roadmap | 从用户可见价值出发拆分增量交付里程碑 |
| [91-protocol-transform-impl-plan.md](./91-protocol-transform-impl-plan.md) | Impl plan | 按依赖顺序拆分落地阶段与退出标准 |
| [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md) | Key decisions | 记录影响实现方向的长期决策与取舍 |
| [92-extend-usage-cache-reasoning-fields.md](./92-extend-usage-cache-reasoning-fields.md) | Spec | 扩展 Usage 结构体，支持缓存和推理 token 字段映射（已实现） |
| [93-compressor-crate.md](./93-compressor-crate.md) | Spec | 新增 `crates/compressor`，payload 压缩/过滤中间件 |

## 3. Reading order

1. [00-protocol-transform-prd.md](./00-protocol-transform-prd.md)
2. [10-protocol-transform-design.md](./10-protocol-transform-design.md)
3. [13-responses-previous-response-id-design.md](./13-responses-previous-response-id-design.md)
4. [99-protocol-transform-key-decisions.md](./99-protocol-transform-key-decisions.md)
5. [90-protocol-transform-roadmap.md](./90-protocol-transform-roadmap.md)
6. [91-protocol-transform-impl-plan.md](./91-protocol-transform-impl-plan.md)

## 4. Build-order graph

```text
00-protocol-transform-prd
  -> 10-protocol-transform-design
       -> 13-responses-previous-response-id-design
       -> 11-lossy-downgrade-checklist
       -> 12-image-download-security
       -> 62-example-chat-roundtrip   # 端到端验证案例（内存级）
       -> 63-http-proxy-example        # 端到端验证案例（真实网络）
       -> 99-protocol-transform-key-decisions
       -> 90-protocol-transform-roadmap
       -> 91-protocol-transform-impl-plan
```

## 5. Milestone mapping

- `00` 锁定协议转换 core 的问题定义与产品边界。
- `10` 锁定 `crates/core` 中 protocol-transform core 的 contract。
- `13` 锁定 `Responses previous_response_id` 的接口边界，明确状态恢复属于 proxy/caller 层，而不是 core transform。
- `99` 锁定为何选择 Rust core 作为唯一语义来源，而非多套语言实现。
- `90` 把设计转换成用户可见里程碑，用来判断每一轮交付是否真的解锁消费价值。
- `91` 将设计转换成可执行的依赖顺序，供后续实现阶段直接消费。

## 6. Entry points for the next step

- 先读 `00` 明确为什么要做 protocol-transform core。
- 然后读 `10`（core design）明确协议、流式、错误、安全的完整 contract。
- 如果要做 `Responses previous_response_id` 兼容，先读 `13`，不要把 store/session 责任塞进 `crates/core`。
- 实际开工前按 `91` 的顺序推进：先最小化 Phase 0，再 core foundation，再 streaming，最后 provider 扩展。

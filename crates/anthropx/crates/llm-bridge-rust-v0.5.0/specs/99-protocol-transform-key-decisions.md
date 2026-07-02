# 99 — Protocol Transform Key Decisions

Status: active v2 · Last updated: 2026-05-18

## D1 — 协议转换层只承诺"语义保真"，不承诺字节级无损

- **Context**：不同 provider 的协议能力并不对称。
- **Alternatives considered**：
  - A. 承诺完全无损可逆
  - B. 只做 best-effort 映射，不定义 contract
- **Decision**：对受支持协议子集承诺语义保真；对无等价能力执行显式有损降级。
- **Why**：A 不真实，B 不可测试；语义保真 + 显式降级是可落地且可审计的中间路径。
- **Pinned by**： [10 §1](./10-protocol-transform-design.md#1-purpose), [10 §3](./10-protocol-transform-design.md#3-invariants)
- **Date**：2026-05-18

## D2 — 流式目标事件模型以 Anthropic SSE 为 canonical contract

- **Context**：Claude Code 兼容路径是当前最高频使用方式。
- **Alternatives considered**：
  - A. 以 OpenAI 流式 delta 为 canonical
  - B. 每个 provider 暴露独立流式模型
- **Decision**：内部流式 contract 贴近 Anthropic 事件模型，统一产出 `message_start -> content_block_* -> message_delta -> message_stop`。
- **Why**：这样可直接服务最高频调用方，并把 OpenAI 增量差异收束在 provider parser 层。
- **Pinned by**： [10 §4.1](./10-protocol-transform-design.md#41-streaming-behaviour), [91 §6](./91-protocol-transform-impl-plan.md#6-phase-3--streaming-spine)
- **Date**：2026-05-18

## D3 — 错误终止通过 `event:error` 表达，`message_stop` 仅 best-effort 收尾

- **Context**：Anthropic SDK 对事件顺序敏感，但底层连接不总是可写。
- **Alternatives considered**：
  - A. 把错误编码进 `StopReason`
  - B. 一旦出错一律直接断流，不尝试收尾
- **Decision**：错误统一走 `event:error`；若已发送 `message_start` 且连接仍可写，则 best-effort 补一个 `message_stop`。
- **Why**：A 混淆正常停止与异常终止；B 与 Anthropic 消费端状态机兼容性较差。
- **Pinned by**： [10 §3](./10-protocol-transform-design.md#3-invariants), [10 §4.2](./10-protocol-transform-design.md#42-error-termination)
- **Date**：2026-05-18

## D4 — 图片内部表示拆成 `ImageSource::Inline` 与 `ImageSource::Url`

- **Context**：不同协议对图片既可能是 inline bytes，也可能是 URL 引用；转换层需要显式保留这种差异。
- **Alternatives considered**：
  - A. 所有图片一进入转换层就下载成字节
  - B. 用一个同时带 `data + url` 的弱约束结构
- **Decision**：使用显式枚举区分 inline bytes 与 URL 引用。
- **Why**：A 会引入不必要下载与副作用；B 无法让非法状态不可表示。
- **Pinned by**： [10 §4.4](./10-protocol-transform-design.md#44-image-url-handling-security), [10 §5](./10-protocol-transform-design.md#5-data-model)
- **Date**：2026-05-18

## D5 — 当前 scope 不在 transform 层执行图片 URL 外部下载

- **Context**：历史设计曾考虑通过下载把 URL 图片转成另一种协议需要的 inline 形式，但这会把网络 I/O、副作用与安全边界带进转换层。
- **Alternatives considered**：
  - A. 在 transform 层直接下载外部图片
  - B. 把 URL 仅当作数据处理，不触发外部请求
- **Decision**：采用 B。当前 scope 中，协议转换层不执行任何基于图片 URL 的外部下载。
- **Why**：这样可以保持转换层纯函数化，避免 SSRF、超时、重定向与内容探测等风险混入核心路径。
- **Pinned by**： [10 §4.4](./10-protocol-transform-design.md#44-image-url-handling-security), [12-image-download-security.md](./12-image-download-security.md)
- **Date**：2026-05-18

## D6 — v1 不包含任何语言 bridge，Rust core 作为 library 独立交付

- **Context**：Go 原生实现是后续阶段的独立项目，不应影响 Rust core 的设计与实现。
- **Alternatives considered**：
  - A. v1 同时交付 Rust core + Go-first bridge server（out-of-process）
  - B. v1 同时交付 Rust core + Go cgo/FFI 绑定
  - C. v1 只交付 Rust core library，Go 后续独立实现
- **Decision**：采用 C。v1 只交付 `crates/core` 作为可嵌入的 Rust library。Go 原生实现在后续阶段独立推进。
- **Why**：A 和 B 都会让 v1 的 scope 膨胀，引入 bridge server 或 FFI 复杂度，拖慢 core 本身的交付。Go 实现需要参考本 spec 与 fixture corpus 保证语义一致，但不依赖 Rust 内部实现。
- **Pinned by**： [00 §4](./00-protocol-transform-prd.md#4-non-goals), [90 §M0](./90-protocol-transform-roadmap.md#m0--rust-core-非流式主路径可用)
- **Date**：2026-05-18

## D7 — 当前 v1 scope 收敛到 Anthropic ↔ OpenAI

- **Context**：早期设计曾为更多 provider 预留扩展位，但当前交付重点已经明确收敛到 Anthropic 与 OpenAI 的双向兼容。
- **Alternatives considered**：
  - A. 继续保留多 provider 设计与实现承诺
  - B. 将 v1 明确收敛为 Anthropic ↔ OpenAI，额外 provider 后续再单独扩展
- **Decision**：采用 B。当前 v1 只承诺 Anthropic ↔ OpenAI 的协议转换 contract。
- **Why**：聚焦后可以减少行为面、fixture 面与维护面，把真实用户最关心的 Claude Code / Codex 兼容链路打磨稳定。
- **Pinned by**： [00 §3](./00-protocol-transform-prd.md#3-goals), [10 §2.1](./10-protocol-transform-design.md#21-supported-directions), [90 §M2](./90-protocol-transform-roadmap.md#m2--provider-compatibility-扩展完成)
- **Date**：2026-05-18

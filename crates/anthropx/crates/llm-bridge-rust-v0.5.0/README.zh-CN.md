[![CI](https://github.com/TokenFleet-AI/llm-bridge-rust/actions/workflows/ci.yml/badge.svg)](https://github.com/TokenFleet-AI/llm-bridge-rust/actions/workflows/ci.yml)
[![Crates.io](https://img.shields.io/crates/v/llm-bridge-core?logo=rust)](https://crates.io/crates/llm-bridge-core)
[![docs.rs](https://img.shields.io/docsrs/llm-bridge-core)](https://docs.rs/llm-bridge-core)
[![Release](https://img.shields.io/github/v/tag/TokenFleet-AI/llm-bridge-rust?sort=semver)](https://github.com/TokenFleet-AI/llm-bridge-rust/tags)
[![Rust 2024](https://img.shields.io/badge/Rust-2024-orange?logo=rust)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

# LLM Bridge

> 多协议 LLM API 桥接层 —— 让 Anthropic 与 OpenAI 兼容接口之间无缝互通。

`llm-bridge` 是一个 Rust-first 的协议转换层，适合那些希望在接入层接收一种 LLM API 形态、在内部对接另一种上游协议的团队。它负责请求、响应以及流式 SSE 事件的协议映射，并尽量保持协议语义清晰且显式。

如果你想要的是协议互通能力，而不是把鉴权、计费、路由、重试或 token 优化都耦合进转换核心，那么这个项目就是为这种场景设计的。

英文文档见 [README.md](README.md)。更详细的设计与交付文档见 [specs/index.md](specs/index.md) 和 [docs/index.md](docs/index.md)。

**快速导航：** [快速开始](#quick-start) · [为什么选择 LLM Bridge](#why-llm-bridge) · [核心亮点](#highlights) · [适用场景](#when-to-use) · [当前状态](#current-status) · [架构设计](#architecture) · [协议转换矩阵](#protocol-translation-matrix) · [构建与开发](#build--development) · [更新日志](CHANGELOG.md)

## 快速开始

将 `llm-bridge-core` 添加到你的项目：

```bash
cargo add llm-bridge-core
```

或在 `Cargo.toml` 中：

```toml
[dependencies]
llm-bridge-core = "0.2"
```

最小示例 — 将 Anthropic 请求转换为 OpenAI Chat Completions：

```rust
use llm_bridge_core::model::{TransformRequest, TransformResponse};
use llm_bridge_core::transform;

let req = TransformRequest::builder()
    .path("/v1/messages")
    .body(anthropic_request_bytes)
    .build();

let openai_response: TransformResponse = transform::anthropic_to_openai(&req)?;
```

更多示例见 [`crates/core/examples/`](crates/core/examples/) — 涵盖流式转换、工具调用、错误处理以及完整 HTTP 代理。

MSRV: Rust 1.85+ (edition 2024)。完整 API 文档见 [docs.rs/llm-bridge-core](https://docs.rs/llm-bridge-core)。

<a id="why-llm-bridge"></a>

## 为什么选择 LLM Bridge

- **只做协议层**：聚焦语义转换，而不是承担网关职责
- **原生面向流式场景**：不仅处理一次性 payload，也处理带跨 chunk 状态的 SSE 事件流
- **Library-first**：可将 `crates/core` 嵌入任意 Rust 进程。参考 HTTP/SSE 服务器实现在 `crates/core/examples/http-proxy.rs`。
- **显式降级行为**：遇到不支持的字段时先记录日志，再明确省略，而不是静默丢弃

<a id="highlights"></a>

## 核心亮点

| 维度 | 能力说明 |
| --- | --- |
| 协议覆盖 | Anthropic Messages ↔ OpenAI Chat Completions / Responses |
| 流式转换 | 已覆盖当前所有已实现跨协议方向的 SSE → SSE 转换 |
| 转换语义 | 不只是字段改名，而是尽量保持请求、响应和事件语义一致 |
| 嵌入方式 | 纯 Rust 核心库 + 示例；独立服务器计划中 |

<a id="when-to-use"></a>

## 适用场景

**适合**使用 `llm-bridge` 的场景：

- 需要让 Anthropic/OpenAI 兼容客户端对接不同的上游协议
- 希望把协议转换作为自有网关或服务中的一个聚焦 Rust 组件
- 需要基于 fixtures 验证非流式和流式转换的互操作性

以下情况通常**不适合**使用 `llm-bridge`：

- 你需要的是一个自带鉴权、计费、路由、故障切换、token 优化的完整 API 网关
- 你只需要同协议透传，并不需要协议转换
- 你期望项目直接承担模型调用上的业务编排逻辑

<a id="current-status"></a>

## 当前状态

当前核心跨协议矩阵在非流式场景下已完成实现，流式转换 API 也已覆盖目前支持的所有跨协议方向：

- **Anthropic → OpenAI Chat Completions**
- **Anthropic → OpenAI Responses**
- **OpenAI Chat Completions → Anthropic**
- **OpenAI Responses → Anthropic**

同协议 passthrough 仍然属于调用方 / proxy 层职责，而不是协议核心的职责范围。`Usage` 结构体现在已扩展缓存和推理 token 字段（`cache_read_input_tokens`、`cache_creation_input_tokens`、`cached_tokens`、`reasoning_tokens`），所有转换路径均已完成 SSE 解析和输出映射。

<a id="architecture"></a>

## 架构设计

```
客户端请求 (Anthropic / OpenAI)
  │
  ▼
Auth / RateLimit / Billing    ← 本 crate 不提供
  │
  ▼
Token Optimizer (可选)         ← 本 crate 不提供
  │
  ▼
┌──────────────────────────┐
│  crates/core (Rust)      │  ← 唯一协议语义层
│  协议转换 · 流式状态机    │
└──────────────────────────┘
  │
  ▼
Forwarder (CircuitBreaker + Failover)  ← 本 crate 不提供
  │
  ▼
上游 Provider (OpenAI / Anthropic)
```

**流式处理说明**：`crates/core` 的流式转换是纯协议层的 SSE ↔ SSE 转换（async stream → async stream），不启动任何 HTTP server。HTTP 的 listen、请求解析、响应写入由上层 server/forwarder 负责。

<a id="protocol-translation-matrix"></a>

## 协议转换矩阵

| 客户端协议 → 上游协议 | 频率 | 状态 |
|---|---|---|
| Anthropic → OpenAI Chat Completions | 最高频 | 核心路径 |
| Anthropic → OpenAI Responses | 中频 | 已实现 |
| Anthropic → Anthropic | 中频 | 直接透传，不转换 |
| OpenAI Chat Completions → OpenAI Chat Completions | 中频 | 直接透传，不转换 |
| OpenAI Responses → OpenAI Responses | 中频 | 直接透传，不转换 |
| OpenAI Chat Completions → Anthropic | 低频 | 反向兼容 |
| OpenAI Responses → Anthropic | 低频 | 已实现 |

## 流式转换状态

非流式请求/响应处理覆盖上表中的矩阵。同协议 passthrough 属于调用方 / proxy 层职责，不需要协议转换。当前流式 transform API 为所有跨协议路径输出 SSE 事件序列：

| 输入流 → 输出流 | 状态 |
|---|---|
| OpenAI Chat SSE → Anthropic SSE | ✓ 已实现 |
| OpenAI Responses SSE → Anthropic SSE | ✓ 已实现 |
| Anthropic SSE → OpenAI Chat Completions SSE | ✓ 已实现 |
| Anthropic SSE → OpenAI Responses SSE | ✓ 已实现 |

此外，当前流式 API 是同步的（`&[u8]` → `Vec<u8>`）—— 计划提供 `Stream<Item = Bytes>` → `Stream<Item = Bytes>` 的异步包装以方便第三方集成。

## 项目结构

```
llm-bridge/
├── crates/
│   └── core/          # 协议转换核心库（非流式 + 流式）
│       └── examples/  # 可运行示例（基础、流式、错误处理、代理）
├── specs/             # 设计文档（PRD、设计、路线图、实现计划、决策记录）
├── fixtures/          # 协议转换测试语料
│   └── protocol-transform/
│       ├── anthropic-to-openai/
│       ├── openai-to-anthropic/
│       └── end-to-end/
└── docs/              # 使用指南、流程文档和技术参考资料
```

## 示例

`crates/core/examples/` 目录包含每个主要功能的可运行自包含示例：

| 示例 | 说明 |
|---|---|
| `basic_nonstream` | 最小 Anthropic → OpenAI 非流式转换 |
| `all_transforms` | 所有支持的转换路径对比 |
| `streaming_text` | OpenAI SSE → Anthropic SSE 文本流式转换 |
| `streaming_tool_use` | 流式工具调用转换 |
| `error_handling` | 错误处理模式演示（非法 JSON、缺失字段等） |
| `chat-roundtrip` | Anthropic ↔ OpenAI 双向转换验证 |
| `http-proxy` | 完整 HTTP 代理，支持主备故障切换 |

```bash
cargo run --example basic_nonstream
cargo run --example streaming_text
cargo run --example http-proxy
```

所有示例均为自包含，无需网络连接（`http-proxy` 除外，需 API Key）。

## 贡献

欢迎贡献！请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解 PR 流程、测试要求和代码风格指南。安全漏洞报告请见 [SECURITY.md](SECURITY.md)。

## 开发路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 0 | 冻结 fixture 语料、风险边界确认 | 已完成 |
| Phase 1 | Rust core 基础：类型定义、Anthropic→OpenAI 非流式转换 | 已完成 |
| Phase 2 | 流式转换核心：SSE 解析、状态机、Anthropic 事件输出 | 已完成 |
| Phase 3 | 反向兼容：OpenAI→Anthropic 与 fixture 加固 | 已完成 |
| Phase 4 | 质量门：完整测试覆盖、clippy、性能验证 | 已完成 |
| Phase 5 | OpenAI Responses API：请求/响应 + 流式转换 | 已完成 |

## 技术栈

- **语言**: Rust 2024 Edition
- **异步运行时**: Tokio
- **序列化**: serde + serde_json
- **错误处理**: thiserror (library) + anyhow (application)
- **测试**: rstest (参数化) + insta (snapshot) + proptest (属性测试)
- **日志**: tracing + tracing-subscriber

<a id="build--development"></a>

## 构建与开发

```bash
# 构建
make build

# 检查
make check

# 测试（cargo-nextest）
make test

# 格式化 + lint
make lint

# 本地执行 CI 风格校验
make ci

# 生成文档
make doc

# 安全审计
cargo audit

# 依赖策略检查
cargo deny check
```

## License

本项目遵循 Apache License 2.0 许可证。详见 [LICENSE](LICENSE)。

Copyright 2020-2026 TokenFleet-AI

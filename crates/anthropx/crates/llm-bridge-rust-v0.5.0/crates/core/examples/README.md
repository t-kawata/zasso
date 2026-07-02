# Examples / 示例

Collection of runnable examples demonstrating each major capability of `llm-bridge-core`.

## Quick start / 快速开始

```bash
cargo run --example basic_nonstream      # Anthropic → OpenAI 非流式示例
cargo run --example all_transforms       # 展示所有支持的协议转换路径
cargo run --example streaming_text       # OpenAI SSE → Anthropic SSE 文本流
cargo run --example streaming_tool_use   # OpenAI 工具调用流式转换
cargo run --example error_handling       # 错误处理模式演示
cargo run --example chat-roundtrip       # Anthropic ↔ OpenAI 双向协议验证
```

## Table of contents / 目录

| # | Example | Description | 中文说明 |
|---|---------|-------------|---------|
| 1 | `basic_nonstream` | Anthropic → OpenAI non-streaming transform | Anthropic 请求转 OpenAI 格式 |
| 2 | `all_transforms` | All supported transform paths | 展示全部非流式转换路径的输入输出对比 |
| 3 | `streaming_text` | OpenAI SSE → Anthropic SSE text stream | OpenAI 流式 SSE 事件转 Anthropic SSE |
| 4 | `streaming_tool_use` | Streaming tool_calls → tool_use | OpenAI 流式工具调用跨 chunk 累积转换 |
| 5 | `error_handling` | Error handling patterns | 非法 JSON、缺失字段、SSRF 拒绝等错误演示 |
| 6 | `chat-roundtrip` | Bidirectional transform verification | Anthropic ↔ OpenAI 双向转换完整性验证 |
| 7 | `http-proxy` | HTTP proxy with primary/backup failover + protocol translation | 启动本地代理服务，主备自动切换，自动协议转换 |

## Protocol translation matrix / 协议转换矩阵

```
客户端请求                   上游 Provider            状态
Anthropic → OpenAI          ✓ (basic_nonstream)       生产就绪
OpenAI    → Anthropic       ✓ (all_transforms)        生产就绪
Anthropic → OpenAI Responses ✓                         生产就绪
OpenAI Responses → Anthropic ✓                         生产就绪
```

## Streaming status / 流式状态

```
方向                           状态
OpenAI SSE     → Anthropic SSE   ✓ (streaming_text, streaming_tool_use)
OpenAI Responses → Anthropic SSE ✓ (responses_to_anthropic_stream)
Anthropic SSE  → OpenAI SSE      ✓ (transform_stream_to_openai_sse)
```

All examples are self-contained and require no network access or API keys, except `http-proxy` which needs `PRIMARY_API_KEY` and `BACKUP_API_KEY` environment variables.
所有示例（除 `http-proxy` 需设置 `PRIMARY_API_KEY` 和 `BACKUP_API_KEY` 环境变量外）均为自包含，无需网络连接或真实 API 密钥。

## HTTP Proxy / 代理服务

`http-proxy` 启动一个本地 HTTP 代理服务，支持主备双上游自动切换。将客户端请求自动转换为上游 Provider 的协议格式，并将响应转换回客户端协议。适合用来让 Anthropic/OpenAI 客户端透明访问另一方协议的 API。

### 主备上游配置

| 线路 | Anthropic 接口 | OpenAI 接口 |
|------|----------------|-------------|
| **主线路** (DashScope) | `https://coding.dashscope.aliyuncs.com/apps/anthropic` | `https://coding.dashscope.aliyuncs.com/v1` |
| **备线路** (TokenPlan) | `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` |

### 故障转移机制

- **429 自动切换**：主线路返回 HTTP 429 (Too Many Requests) 时，自动切换到备线路
- **健康检查**：每分钟探测主线路，健康时自动切回
- **独立密钥**：主备线路各自使用独立的 API Key

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `PRIMARY_API_KEY` | 是 | 主线路 (DashScope) API Key |
| `BACKUP_API_KEY` | 是 | 备线路 (TokenPlan) API Key |
| `PROXY_API_KEY` | 否 | 代理认证密钥（设置后客户端需提供此密钥） |
| `PROXY_LISTEN` | 否 | 监听地址，默认 `127.0.0.1:3000` |
| `DEBUG_ANTHROPIC_SSE` | 否 | 设为 `1`/`true`/`yes` 启用原始 SSE 调试日志 |

### 启动

```bash
# 标准启动（主备双线路）
PRIMARY_API_KEY=sk-dashscope-key \
BACKUP_API_KEY=sk-tokenplan-key \
  cargo run --example http-proxy

# 带代理认证
PRIMARY_API_KEY=sk-dashscope-key \
BACKUP_API_KEY=sk-tokenplan-key \
PROXY_API_KEY=sk-proxy-secret \
  cargo run --example http-proxy

# 自定义监听地址
PROXY_LISTEN=0.0.0.0:8080 \
PRIMARY_API_KEY=sk-dashscope-key \
BACKUP_API_KEY=sk-tokenplan-key \
  cargo run --example http-proxy
```

### 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/messages` | Anthropic 客户端入口 → 转换为 OpenAI 格式发往上游（如上游为原生 Anthropic API 则直连透传） |
| `POST` | `/v1/chat/completions` | OpenAI Chat 客户端入口 → 转换为 Anthropic Messages 发给上游 |
| `POST` | `/v1/responses` | OpenAI Responses 客户端入口 → 转换为 Anthropic Messages 发给上游 |
| `GET` | `/health` | 健康检查，返回 `{"status":"ok"}` |

### 使用示例

**Anthropic 客户端访问代理（自动转 OpenAI 格式发往上游）：**

```bash
# 启动代理（主备双线路，自动故障切换）
PRIMARY_API_KEY=sk-dashscope-key \
BACKUP_API_KEY=sk-tokenplan-key \
  cargo run --example http-proxy

# 用 Anthropic SDK 访问代理（代理会自动转换为 OpenAI 格式）
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-key" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 128,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**OpenAI 客户端访问代理（自动转 Anthropic 格式发往上游）：**

```bash
# 启动代理（主线路 DashScope 同时支持 Anthropic 和 OpenAI 协议）
PRIMARY_API_KEY=sk-dashscope-key \
BACKUP_API_KEY=sk-tokenplan-key \
  cargo run --example http-proxy

# 用 OpenAI SDK 访问代理（代理会自动转换为 Anthropic 格式）
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 协议转换路径

```
客户端 → 代理 → 主线路(或备线路)

/v1/messages (Anthropic)      → 转换为 OpenAI Chat Completions → 主线路 /v1 (DashScope)
/v1/messages (Anthropic)      → 直连透传 (不转换)            → 上游 Anthropic API*
/v1/chat/completions (OpenAI) → 转换为 Anthropic Messages       → 主线路 /apps/anthropic
/v1/responses (OpenAI)        → 转换为 Anthropic Messages       → 主线路 /apps/anthropic
```

*当上游检测到原生 Anthropic API（如 api.anthropic.com）时，请求直接透传不转换。

### 故障转移时序

```
正常状态:
  客户端 → 代理 → 主线路(DashScope)

主线路 429:
  客户端 → 代理 → 备线路(TokenPlan)  [自动切换]

主线路恢复(健康检查通过):
  客户端 → 代理 → 主线路(DashScope)  [自动切回]
```

流式（`"stream": true`）和非流式请求均支持，代理自动处理 SSE 帧转换。

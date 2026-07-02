# 63-http-proxy-example: 可运行的 HTTP/SSE proxy 服务器

Status: draft v1 · Owner: llm-bridge team · Depends on: 10-protocol-transform-design, 62-example-chat-roundtrip

## 1. Purpose

添加一个可运行的 HTTP proxy server，启动真实的服务监听，接收 Anthropic / OpenAI 格式的请求，按路由选择执行：

- **同协议 passthrough**：由 proxy 直接转发到同协议上游，不进入 `crates/core` transform 层；
- **跨协议转换**：通过 `crates/core` 的 transform 层转发到真实上游 provider，并将响应（包括 SSE 流式）回传给客户端。

与 spec 62 的区别：62 是**内存级 mock 响应**验证转换逻辑正确性；63 是**端到端真实网络链路**——启动 HTTP 服务、发真实请求到真实 API、拿到真实响应。

开发者可以用 `cargo run --example http-proxy` 一键启动，然后用 `curl` 或真实 SDK 打到这个 proxy。

## 2. Scope

### 2.1 支持的代理路径

| 客户端打到的路径 | 上游目标 | 转换函数 | 模式 |
|---|---|---|---|
| `POST /v1/messages` (Anthropic) | OpenAI `/v1/chat/completions` | `anthropic_to_openai` | 非流式 + 流式 |
| `POST /v1/chat/completions` (OpenAI) | Anthropic `/v1/messages` | `openai_to_anthropic` | 非流式 + 流式 |

同协议路径（`Anthropic → Anthropic`、`OpenAI → OpenAI`）如果由 proxy 支持，应走**直接透传**，不调用 `crates/core` 的协议转换函数。

初始阶段优先覆盖 **Anthropic → OpenAI** 这一条主路径，同时保留 **OpenAI → Anthropic** 的兼容入口。

### 2.2 技术选型

- **HTTP 框架**: `axum` — 与项目已有的 Tokio async runtime 兼容，路由清晰
- **上游 HTTP 客户端**: `reqwest` — 支持连接池、超时、流式 body 读取
- **SSE 处理**: 手工 SSE framing — 同协议 SSE 由 proxy 直接透传；跨协议 SSE 由 `crates/core` 的 `transform_stream_events` 做事件转换

### 2.3 不覆盖的

- 认证 / API key 管理（proxy 透明转发上游 key）
- 路由 / 上游选择 / 负载均衡（固定 1:1 映射）
- 熔断 / 重试 / 限流（非本阶段目标）
- Go 原生 server（后续独立 crate）

## 3. 接口设计

### 3.1 启动方式

```bash
# 默认监听 127.0.0.1:3000，代理到上游 provider
PROXY_LISTEN=0.0.0.0:3000 \
UPSTREAM_URL=https://coding.dashscope.aliyuncs.com/v1 \
UPSTREAM_API_KEY=sk-your-key \
PROXY_API_KEY=sk-proxy-key \
cargo run --example http-proxy
```

环境变量：
- `PROXY_LISTEN` — 监听地址，默认 `127.0.0.1:3000`
- `UPSTREAM_URL` — 上游 provider 基础 URL，默认 `https://coding.dashscope.aliyuncs.com/v1`
- `UPSTREAM_API_KEY` — **必填**。proxy 用来打上游的 API key（不会被日志输出）
- `PROXY_API_KEY` — **可选**。客户端打到 proxy 时需要带的 key；不设则跳过认证

### 3.2 使用方式

启动后，客户端可以直接打 `http://localhost:3000` 代替真实 OpenAI：

```bash
# 用 curl 测试 Anthropic 格式请求 → 代理到 OpenAI
curl http://localhost:3000/v1/messages \
  -H "x-api-key: sk-ant-test" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

或者用 Anthropic SDK 直接指向 proxy 地址：

```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:3000",
    api_key="sk-ant-test"  # 会被 proxy 转发
)
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=256,
    messages=[{"role": "user", "content": "Say hello"}]
)
print(response.content[0].text)
```

### 3.3 代码结构

`crates/core/examples/http-proxy.rs` 作为单文件可运行示例：

```
main()
├── read_env() -> ProxyConfig
├── create_router(config) -> Router
│   ├── POST /v1/messages     -> handle_anthropic_request()
│   └── POST /v1/chat/completions -> handle_openai_request()
└── axum::serve(listener, router).await
```

每个 handler：
```rust
async fn handle_anthropic_request(
    headers: HeaderMap,
    path: Uri,
    body: Bytes,
    config: State<ProxyConfig>,
) -> Result<Response<Body>, AppError> {
    // 1. 构造 TransformRequest
    let req = TransformRequest { headers, path, body };

    // 2. 协议转换 (core transform)
    let transformed = anthropic_to_openai(&req)?;

    // 3. 转发到上游
    let upstream_resp = reqwest::Client::new()
        .post(format!("{}{}", config.upstream_url, transformed.path))
        .headers(transformed.headers)
        .body(transformed.body)
        .send()
        .await?;

    // 4. 将上游响应透传回客户端
    // (如果需要反向转换，在这里调用 openai_to_anthropic_response_transform)
    Ok(upstream_resp.into_response())
}
```

职责边界：

- **proxy 层**：路由、鉴权、同协议直通、上游 I/O、header 复制、SSE transport 转发。
- **core transform 层**：仅负责跨协议 request/response/SSE 语义转换。

### 3.4 流式支持

流式场景需要双向 SSE 转发：

```rust
async fn handle_anthropic_stream(
    config: State<ProxyConfig>,
    // ... headers + body
) -> Result<StreamingResponse, AppError> {
    // 1. 协议转换
    let transformed = anthropic_to_openai(&req)?;

    // 2. 发流式请求到上游
    let stream = reqwest::Client::new()
        .post(...)
        .body(transformed.body)
        .send()
        .await?
        .bytes_stream();

    // 3. 用 crates/core 的 transform_stream_events 转换 SSE 流
    let converted_stream = transform_stream_events(
        ApiFormat::OpenAI,
        stream,
        StreamState::default(),
    );

    // 4. 以 SSE 响应返回
    Ok(StreamingResponse::new(converted_stream))
}
```

## 4. 行为

### 场景 1：非流式 Anthropic → OpenAI

- 客户端发 Anthropic 格式到 `POST /v1/messages`
- Proxy 用 `anthropic_to_openai` 转换
- 转发到真实 OpenAI API
- OpenAI 返回真实响应
- Proxy 将 OpenAI 响应格式转回 Anthropic 响应格式
- 客户端收到 Anthropic 格式的 JSON

### 场景 2：流式 Anthropic → OpenAI (SSE)

- 客户端发 `stream: true` 的 Anthropic 请求
- Proxy 转换后发流式请求到 OpenAI
- OpenAI 返回 SSE 流
- Proxy 用 `transform_stream_events` 逐事件转换
- 客户端收到 Anthropic 格式的 SSE 流

### 场景 3：错误传播

- 上游 4xx/5xx 错误直接透传
- transform 层的 `TransformError` 映射为 400 Bad Request
- 网络超时映射为 504 Gateway Timeout

## 5. 约束

### 5.1 安全

- 不在日志中打印 API key（用 `tracing` 的 `Debug` redaction）
- 请求体大小上限：16 MB（用 `tower_http::limit::RequestBodyLimitLayer`）
- 所有上游请求设置超时：30 秒（`tokio::time::timeout`）

### 5.2 工程规范

- 错误处理：per CLAUDE.md § Error Handling — `anyhow` for app-level, `thiserror` for domain errors
- 日志：per CLAUDE.md § Logging — `tracing` structured logging, no `println!`
- 依赖：只添加必要的 `axum` + `reqwest`，不在 workspace 引入多余 crate
- 格式：`cargo +nightly fmt` 和 `cargo clippy -- -D warnings` 无警告

## 6. 成功标准

1. `cargo run --example http-proxy` 无 panic 启动
2. `curl` 打到 `localhost:3000/v1/messages` 收到 Anthropic 格式的 JSON 响应
3. 流式请求收到 Anthropic 格式的 SSE 事件流（`event: message_start`, `event: content_block_start`, `event: message_stop` 等）
4. 用 Anthropic Python SDK 指向 proxy 可以正常对话
5. 运行 `cargo +nightly fmt` 和 `cargo clippy` 无警告

## 7. 依赖的新 crate

| Crate | Version | Why |
|---|---|---|
| `axum` | `0.7` | HTTP server, router, middleware |
| `reqwest` | `0.12` | HTTP client with streaming support |
| `tower` | `0.5` | Tower middleware |
| `tower-http` | `0.6` | Request body limit layer |
| `futures` | `0.3` | Stream combinators |
| `http-body-util` | `0.1` | Body conversion utilities |

这些依赖添加到 `crates/core/Cargo.toml` 的 `[dev-dependencies]` 中，只在 example 中使用。

## 8. Cross-references

- ← Depends on: [10-protocol-transform-design.md](./10-protocol-transform-design.md) §2.4 (transform rules)
- ← Depends on: [62-example-chat-roundtrip.md](./62-example-chat-roundtrip.md) (in-memory transform baseline)
- → Consumed by: 开发者本地测试 + 后续 CI 集成
- ↔ Related: `crates/core/src/transform.rs` 的 `anthropic_to_openai` / `transform_stream_events`
- ↔ Related: `crates/core/src/stream.rs` 的 `StreamState` / `ApiFormat`

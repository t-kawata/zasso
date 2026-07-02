# Protocol Transform Enhancements Design

Date: 2026-06-26 · Status: draft · Inspected from: new-api (QuantumNous/new-api)

## 0. Motivation

new-api（Go 语言 LLM 网关，40+ 供应商）在协议转换领域的工程化程度很高。从中提取了 6 项适用于 llm-bridge-rust（Rust 协议翻译库）的改进，覆盖可观测性、安全性、可扩展性、语义映射四个维度。

## 1. Scope & Non-scope

**In scope（本阶段）:**
- Stop Reason 集中映射表
- 转换链追踪（Conversion Trail）
- 字段安全过滤
- ProtocolAdapter trait + 注册表（覆盖 Anthropic Messages / OpenAI Chat / OpenAI Responses）
- Thinking 参数跨协议映射
- Web Search 工具跨协议映射

**Next phase（下一阶段）:**
- Gemini GenerateContent Adapter 实现
- Gemini 校验函数与方向映射
- Gemini 方向 fixture

**Out of scope:**
- Param Override 引擎（网关层功能，违反 library-only 定位）
- GeneralOpenAIRequest 超级结构体（反模式，Rust 类型系统应精确表达）
- Python 校验系统重构

## 2. New Modules

### 2.1 `transform/stop_reason.rs` — Stop Reason 映射表

集中管理跨供应商 stop/finish reason 的双向映射，取代散落在 `response_transforms.rs` 中的 inline match。

```rust
// 核心映射表：Canonical StopReason ↔ 各协议字符串
pub(crate) const ANTHROPIC_TO_CANONICAL: &[(&str, StopReason)] = &[
    ("end_turn", StopReason::EndTurn),
    ("max_tokens", StopReason::MaxTokens),
    ("tool_use", StopReason::ToolUse),
    ("stop_sequence", StopReason::StopSequence),
    ("content_filter", StopReason::ContentFilter),
    ("refusal", StopReason::ContentFilter),
];

pub(crate) const OPENAI_TO_CANONICAL: &[(&str, StopReason)] = &[
    ("stop", StopReason::EndTurn),
    ("length", StopReason::MaxTokens),
    ("tool_calls", StopReason::ToolUse),
    ("content_filter", StopReason::ContentFilter),
];

pub(crate) fn canonical_to_anthropic(reason: StopReason) -> &'static str { ... }
pub(crate) fn canonical_to_openai(reason: StopReason) -> &'static str { ... }
```

### 2.2 `model.rs` 变更 — Conversion Trail

`TransformResponse` 增加 `conversion_trail` 字段：

```rust
pub struct TransformResponse {
    pub headers: HashMap<String, String>,
    pub path: String,
    pub body: Bytes,
    /// 记录转换链路，如 [AnthropicMessages, OpenaiChat]
    #[serde(default)]
    pub conversion_trail: Vec<ApiFormat>,
}
```

### 2.3 `transform/field_filter.rs` — 字段安全过滤

可配置的危险字段剥离。

```rust
pub struct TransformOptions {
    /// 额外需要剥离的字段路径（如 ["service_tier", "safety_identifier"]）
    pub strip_fields: Vec<String>,
    /// 是否允许透传未知字段（true=宽松，false=拒绝未知字段）
    pub allow_unknown_fields: bool,
}

impl Default for TransformOptions {
    fn default() -> Self {
        Self {
            strip_fields: vec![
                "service_tier".into(),
                "safety_identifier".into(),
                "inference_geo".into(),
                "speed".into(),
            ],
            allow_unknown_fields: true,
        }
    }
}

/// 从 JSON value 中递归移除指定字段
pub(crate) fn strip_fields(value: &mut serde_json::Value, fields: &[String]) { ... }
```

### 2.4 `transform/adapter.rs` — ProtocolAdapter Trait

```rust
use std::fmt::Debug;

pub trait ProtocolAdapter: Debug + Send + Sync {
    /// 目标协议格式
    fn target_format(&self) -> ApiFormat;

    /// 转换非流式请求
    fn convert_request(
        &self,
        request: &TransformRequest,
        options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError>;

    /// 转换非流式响应
    fn convert_response(
        &self,
        response: &TransformResponse,
        options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError>;

    /// 转换请求头
    fn convert_headers(
        &self,
        headers: &HashMap<String, String>,
    ) -> HashMap<String, String>;
}
```

`target_format()` 返回枚举值。未来新增供应商（如 Gemini）时，扩展 `ApiFormat` 枚举并新增 Adapter 实现即可，不影响现有代码。

Trait 设计要点：
- `Debug + Send + Sync` 约束：适配器可跨线程传递、可放入注册表
- 每个方法接收 `&TransformOptions`：保持请求级配置的独立性
- 返回 `Result<_, TransformError>`：所有转换路径都有统一错误出口

具体 Adapter 实现（内置 4 个）：

```rust
// Anthropic → OpenAI
#[derive(Debug)]
pub struct AnthropicToOpenAiAdapter;
impl ProtocolAdapter for AnthropicToOpenAiAdapter { ... }

// OpenAI → Anthropic
#[derive(Debug)]
pub struct OpenAiToAnthropicAdapter;
impl ProtocolAdapter for OpenAiToAnthropicAdapter { ... }

// Anthropic → OpenAI Responses
#[derive(Debug)]
pub struct AnthropicToResponsesAdapter;
impl ProtocolAdapter for AnthropicToResponsesAdapter { ... }

// OpenAI Responses → Anthropic
#[derive(Debug)]
pub struct ResponsesToAnthropicAdapter;
impl ProtocolAdapter for ResponsesToAnthropicAdapter { ... }
```

每个 Adapter 内部委托给现有 `transform::anthropic_to_openai()` 等函数，不重写逻辑。

注册表：

```rust
pub struct AdapterRegistry {
    adapters: HashMap<(ApiFormat, ApiFormat), Box<dyn ProtocolAdapter>>,
}

impl AdapterRegistry {
    pub fn new() -> Self { ... }
    pub fn register(&mut self, from: ApiFormat, to: ApiFormat, adapter: Box<dyn ProtocolAdapter>) { ... }
    pub fn get(&self, from: ApiFormat, to: ApiFormat) -> Option<&dyn ProtocolAdapter> { ... }
}

/// 惰性初始化的内置注册表，预注册所有已支持方向
pub fn default_registry() -> AdapterRegistry { ... }
```

### 2.5 `transform/thinking.rs` — 思考参数映射

```rust
/// Reasoning effort levels mapped to thinking token budgets
pub(crate) const REASONING_EFFORT_BUDGETS: &[(&str, u64)] = &[
    ("low", 1280),
    ("medium", 2048),
    ("high", 4096),
];

/// OpenAI reasoning_effort → Anthropic ThinkingConfig
pub(crate) fn openai_effort_to_anthropic_thinking(
    effort: &str,
    max_tokens: u64,
) -> Option<ThinkingConfig> { ... }

/// Anthropic thinking content → OpenAI reasoning_content JSON
pub(crate) fn anthropic_thinking_to_openai_reasoning(
    thinking_text: &str,
    thinking_usage: Option<u64>,
) -> serde_json::Value { ... }
```

参考 new-api 的特殊处理（当前仅 Anthropic ↔ OpenAI 方向）：
- Opus 4.7/4.8 强制 temperature=1.0，清除 top_p/top_k
- `-thinking` 后缀模型自动启用 thinking.budget_tokens = max_tokens * 0.8

### 2.6 `transform/web_search.rs` — 搜索工具映射

```rust
/// OpenAI web_search_options → Anthropic web_search_20250305 工具定义
pub(crate) fn openai_web_search_to_anthropic_tool(
    options: &WebSearchOptions,
) -> Option<serde_json::Value> { ... }

/// 从 OpenAI 请求 body 中提取并移除 web_search_options 字段
pub(crate) fn extract_web_search_options(
    body: &mut serde_json::Value,
) -> Option<WebSearchOptions> { ... }
```

映射规则：
- `search_context_size`: `"low" → max_uses=1`, `"medium" → 5`, `"high" → 10`
- `user_location` 结构重组：OpenAI `{approximate: {country, region, city, timezone}}` → Anthropic `user_location` 字段

## 3. Refactoring Strategy

现有 6 个 transform 文件 **不删除、不重命名**。仅做内部引用调整：

| 文件 | 变更 |
|---|---|
| `transform/anthropic_to_openai.rs` | 引用 `stop_reason::canonical_to_openai` 替代 inline mapping |
| `transform/openai_to_anthropic.rs` | 引用 `stop_reason::canonical_to_anthropic`；引用 `thinking.rs`；引用 `web_search.rs` |
| `transform/response_transforms.rs` | 引用 `stop_reason`；引用 `thinking.rs` |
| `transform/anthropic_to_responses.rs` | 引用 `stop_reason` |
| `transform/mod.rs` | 注册 adapter registry，暴露新模块，re-export |
| `model.rs` | `TransformResponse` 加 `conversion_trail` |

## 4. Python Validation Extensions

### 4.1 `validators.py`

不变。现有 SDK 校验函数已覆盖 Anthropic/OpenAI/Responses 三方格式，停止原因合法性由 SDK 隐式校验。

### 4.2 新增 Fixture 目录

```
fixtures/protocol-transform/
├── field-filter/           # 🆕 字段过滤：输入含危险字段，断言已剥离
├── thinking-mapping/       # 🆕 思考映射：reasoning_effort → thinking.budget
├── web-search-mapping/     # 🆕 搜索工具：web_search_options → Claude tool
```

## 5. Test Requirements

每个新模块必须包含 `#[cfg(test)] mod tests`，覆盖：

| 模块 | 测试要点 |
|---|---|
| `stop_reason.rs` | 所有已知映射的正确性；未知 reason 降级为 LossyDowngrade |
| `field_filter.rs` | 默认危险字段剥离；自定义 strip_fields；嵌套字段；空值处理 |
| `adapter.rs` | 注册/查找命中与未命中；每个已注册 Adapter target_format 正确 |
| `thinking.rs` | effort 三档 → budget 映射；Opus 4.7/4.8 特殊处理；空 effort 返回 None |
| `web_search.rs` | context_size→max_uses 三档；user_location 重组；无 options 返回 None |

## 6. Error Handling

- 映射失败不 panic，返回 `TransformError::LossyDowngrade` 并记录 `debug!` 日志
- 字段过滤失败不影响请求处理，仅 `warn!` 记录
- Adapter 未找到返回 `TransformError::InvalidFormat`

## 7. Backward Compatibility

- `TransformResponse` 新增 `conversion_trail` 字段带 `#[serde(default)]`，旧 JSON 输出不报错
- 现有 `transform::anthropic_to_openai()` 等公开函数签名不变，内部改为委托 Adapter
- 所有现有 fixture 继续通过

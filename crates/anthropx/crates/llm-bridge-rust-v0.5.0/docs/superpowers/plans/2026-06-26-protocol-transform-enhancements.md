<!-- Issue: #1 -->
# Protocol Transform Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 llm-bridge-rust core 中新增 6 个模块（stop_reason、field_filter、thinking、web_search、adapter + registry、conversion_trail），重构现有 transform 文件引用新模块，并补充 Python 验证 fixtures。

**Architecture:** 新增模块均为 `crates/core/src/transform/` 下的独立文件，提供 `pub(crate)` 辅助函数与常量；`adapter.rs` 定义 `ProtocolAdapter` trait 与 `AdapterRegistry`，内置 4 个 adapter 委托给现有转换函数。`TransformResponse` 通过新增 `conversion_trail: Vec<ApiFormat>` 字段记录链路。`TransformOptions` 作为请求级配置贯穿所有适配层。

**Tech Stack:** Rust 2024, serde / serde_json, bytes, thiserror, tracing, typed-builder, rstest, Python pytest fixtures

## Global Constraints

- 所有新模块必须通过 `cargo clippy -- -D warnings -W clippy::pedantic`
- 禁止使用 `unwrap()` / `expect()`；错误统一走 `TransformError`
- 现有公开函数签名不可变（`anthropic_to_openai`、`openai_to_anthropic` 等）
- `TransformResponse` 新增字段必须带 `#[serde(default)]` 保持向后兼容
- 每个新模块必须包含 `#[cfg(test)] mod tests`，覆盖正常路径与错误降级路径
- 不新增 crate 依赖；只使用 workspace 已有 crate

## GitHub Issue 规划

**Issue 标题:** feat: protocol transform enhancements (stop reason mapping, conversion trail, field filter, adapter registry, thinking, web search)

**Issue 标签:** enhancement,core,priority:high

**Issue 描述:**
集中管理跨供应商 stop reason 映射、增加转换链追踪、字段安全过滤、ProtocolAdapter trait 注册表、Thinking 参数跨协议映射、Web Search 工具映射。覆盖 Anthropic Messages / OpenAI Chat / OpenAI Responses 三个协议方向，为后续接入 Gemini 等新协议做结构准备。

**验收标准:**
- [ ] 所有任务完成
- [ ] 测试通过（单元测试 + 集成测试）
- [ ] 代码审查通过
- [ ] 文档更新
- [ ] `make ci` 全绿
- [ ] 新增 Python fixtures 通过 pytest

**关联:**
- 设计文档: `docs/superpowers/specs/2026-06-26-protocol-transform-enhancements-design.md`
- 计划文件: `docs/superpowers/plans/2026-06-26-protocol-transform-enhancements.md`

## File Structure

```
crates/core/src/
├── model.rs                              [MODIFY] 新增 TransformResponse.conversion_trail、TransformOptions
└── transform/
    ├── mod.rs                            [MODIFY] 注册新模块、re-export AdapterRegistry/TransformOptions
    ├── stop_reason.rs                    [NEW]    StopReason ↔ 各协议字符串双向映射表
    ├── field_filter.rs                   [NEW]    TransformOptions + strip_fields()
    ├── thinking.rs                       [NEW]    reasoning_effort ↔ ThinkingConfig 映射
    ├── web_search.rs                     [NEW]    web_search_options ↔ Anthropic tool 映射
    ├── adapter.rs                        [NEW]    ProtocolAdapter trait + AdapterRegistry + 4 个内置 Adapter
    ├── anthropic_to_openai.rs            [MODIFY] 引用 stop_reason::canonical_to_openai
    ├── openai_to_anthropic.rs            [MODIFY] 引用 stop_reason、thinking、web_search
    ├── response_transforms.rs            [MODIFY] 引用 stop_reason、thinking
    ├── anthropic_to_responses.rs         [MODIFY] 引用 stop_reason
    └── tests.rs                          [MODIFY] 补充新模块的单元测试（如需要）

fixtures/protocol-transform/
├── field-filter/                         [NEW DIR]
│   ├── input-with-dangerous-fields.json
│   └── expected-stripped.json
├── thinking-mapping/                     [NEW DIR]
│   ├── input-reasoning-effort-low.json
│   └── expected-thinking-config.json
└── web-search-mapping/                   [NEW DIR]
    ├── input-web-search-options.json
    └── expected-anthropic-tool.json
```

## Tasks

### Task 1: 创建 GitHub Issue

**Description:** 从 "GitHub Issue 规划" 部分提取信息，创建 Issue 并保存编号到 `.claude/gh-issue/current-issue.txt`。

- [ ] **Step 1: 运行 scripts/create-issue.sh**

```bash
bash /Users/byx/.claude/skills/writing-plans-with-issue/scripts/create-issue.sh docs/superpowers/plans/2026-06-26-protocol-transform-enhancements.md
```

- [ ] **Step 2: 验证 Issue 已创建**

```bash
cat .claude/gh-issue/current-issue.txt
gh issue view "$(cat .claude/gh-issue/current-issue.txt)"
```

### Task 2: 同步 Issue 状态为 in-progress

**Description:** 将 Issue 状态更新为 `status: in-progress`，表示开发已开始。

- [ ] **Step 1: 运行 scripts/sync-status.sh**

```bash
bash /Users/byx/.claude/skills/writing-plans-with-issue/scripts/sync-status.sh in-progress
```

- [ ] **Step 2: 确认**

```bash
echo "✅ Issue #$(cat .claude/gh-issue/current-issue.txt) 已标记为 in-progress"
```

### Task 3: 新建 `transform/stop_reason.rs`

**Description:** 集中管理 Anthropic/OpenAI stop reason 字符串与 `StopReason` 枚举的双向映射，取代散落在各 transform 文件中的 inline match。

- [ ] **Step 1: 创建 `crates/core/src/transform/stop_reason.rs`**

```rust
//! Centralized stop-reason mapping between canonical `StopReason` and
//! provider-specific string codes.
//!
//! Replaces inline `match` expressions scattered across transform files with
//! a single source of truth.

use crate::model::StopReason;

/// Anthropic stop reason strings → canonical `StopReason`.
pub(crate) const ANTHROPIC_TO_CANONICAL: &[(&str, StopReason)] = &[
    ("end_turn", StopReason::EndTurn),
    ("max_tokens", StopReason::MaxTokens),
    ("tool_use", StopReason::ToolUse),
    ("stop_sequence", StopReason::StopSequence),
    ("content_filter", StopReason::ContentFilter),
    ("refusal", StopReason::ContentFilter),
];

/// OpenAI stop reason strings → canonical `StopReason`.
pub(crate) const OPENAI_TO_CANONICAL: &[(&str, StopReason)] = &[
    ("stop", StopReason::EndTurn),
    ("length", StopReason::MaxTokens),
    ("tool_calls", StopReason::ToolUse),
    ("content_filter", StopReason::ContentFilter),
];

/// Look up the canonical `StopReason` for an Anthropic stop reason string.
///
/// Returns `None` for unknown strings; callers should log and downgrade.
pub(crate) fn anthropic_to_canonical(s: &str) -> Option<StopReason> {
    ANTHROPIC_TO_CANONICAL
        .iter()
        .find(|(k, _)| *k == s)
        .map(|(_, v)| *v)
}

/// Look up the canonical `StopReason` for an OpenAI stop reason string.
pub(crate) fn openai_to_canonical(s: &str) -> Option<StopReason> {
    OPENAI_TO_CANONICAL
        .iter()
        .find(|(k, _)| *k == s)
        .map(|(_, v)| *v)
}

/// Map canonical `StopReason` to Anthropic string code.
pub(crate) fn canonical_to_anthropic(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end_turn",
        StopReason::MaxTokens => "max_tokens",
        StopReason::ToolUse => "tool_use",
        StopReason::StopSequence => "stop_sequence",
        StopReason::ContentFilter => "content_filter",
    }
}

/// Map canonical `StopReason` to OpenAI string code.
pub(crate) fn canonical_to_openai(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "stop",
        StopReason::MaxTokens => "length",
        StopReason::ToolUse => "tool_calls",
        StopReason::StopSequence | StopReason::ContentFilter => "stop",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_map_anthropic_known_reasons() {
        assert_eq!(anthropic_to_canonical("end_turn"), Some(StopReason::EndTurn));
        assert_eq!(anthropic_to_canonical("max_tokens"), Some(StopReason::MaxTokens));
        assert_eq!(anthropic_to_canonical("tool_use"), Some(StopReason::ToolUse));
        assert_eq!(anthropic_to_canonical("refusal"), Some(StopReason::ContentFilter));
    }

    #[test]
    fn test_should_return_none_for_unknown_anthropic() {
        assert_eq!(anthropic_to_canonical("bogus"), None);
    }

    #[test]
    fn test_should_map_openai_known_reasons() {
        assert_eq!(openai_to_canonical("stop"), Some(StopReason::EndTurn));
        assert_eq!(openai_to_canonical("length"), Some(StopReason::MaxTokens));
        assert_eq!(openai_to_canonical("tool_calls"), Some(StopReason::ToolUse));
    }

    #[test]
    fn test_should_round_trip_anthropic() {
        for reason in [
            StopReason::EndTurn,
            StopReason::MaxTokens,
            StopReason::ToolUse,
            StopReason::StopSequence,
            StopReason::ContentFilter,
        ] {
            let s = canonical_to_anthropic(reason);
            assert_eq!(anthropic_to_canonical(s), Some(reason));
        }
    }

    #[test]
    fn test_should_round_trip_openai() {
        for reason in [
            StopReason::EndTurn,
            StopReason::MaxTokens,
            StopReason::ToolUse,
            StopReason::ContentFilter,
        ] {
            let s = canonical_to_openai(reason);
            assert_eq!(openai_to_canonical(s), Some(reason));
        }
    }
}
```

- [ ] **Step 2: 在 `transform/mod.rs` 中注册模块**

在 `mod anthropic_to_openai;` 之前加一行：

```rust
mod stop_reason;
```

- [ ] **Step 3: 验证模块编译**

```bash
cargo build -p llm-bridge-core 2>&1 | tail -20
cargo test -p llm-bridge-core --lib transform::stop_reason 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add crates/core/src/transform/stop_reason.rs crates/core/src/transform/mod.rs
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "feat(transform): add centralized stop reason mapping (#${ISSUE})"
```

### Task 4: 修改 `model.rs` — TransformResponse 增加 conversion_trail

**Description:** 为 `TransformResponse` 新增 `conversion_trail: Vec<ApiFormat>` 字段，记录转换链路。

- [ ] **Step 1: 修改 `crates/core/src/model.rs`**

在 `TransformResponse` 结构体中追加字段（注意 `TypedBuilder` 派生会自动生成 builder 方法）：

```rust
#[derive(Debug, Clone)]
pub struct TransformResponse {
    /// Transformed HTTP headers for the target provider.
    pub headers: HashMap<String, String>,
    /// The transformed request path (e.g., `/v1/chat/completions`).
    pub path: String,
    /// The transformed body bytes.
    pub body: Bytes,
    /// The sequence of API formats traversed during transformation
    /// (e.g., `[AnthropicMessages, OpenaiChat]`).
    #[serde(default)]
    pub conversion_trail: Vec<ApiFormat>,
}
```

注意：`TransformResponse` 当前派生 `TypedBuilder`，新增字段会自动成为 builder 必填项。需要同时更新所有 `TransformResponse::builder()...build()` 调用点，追加 `.conversion_trail(vec![...])` 或 `.conversion_trail(default())`。

- [ ] **Step 2: 查找并更新所有 TransformResponse 构造点**

```bash
grep -rn "TransformResponse::builder\|TransformResponse {" crates/core/src/
```

为每个调用点添加 `.conversion_trail(vec![...])`，其中值根据具体转换方向决定（如 `anthropic_to_openai` 填充 `vec![ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat]`）。

- [ ] **Step 3: 验证编译 + 现有测试通过**

```bash
cargo build -p llm-bridge-core 2>&1 | tail -20
cargo test -p llm-bridge-core 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add crates/core/src/model.rs crates/core/src/transform/
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "feat(model): add conversion_trail field to TransformResponse (#${ISSUE})"
```

### Task 5: 新建 `transform/field_filter.rs`

**Description:** 提供 `TransformOptions` 配置结构与 `strip_fields()` 递归剥离函数。

- [ ] **Step 1: 在 `model.rs` 中添加 `TransformOptions`**

`TransformOptions` 是请求级配置，放在 `model.rs` 的 `TransformRequest` 附近更合适（被所有 transform 模块共享）。

```rust
/// Request-level configuration for protocol transformation.
///
/// Controls field stripping and unknown-field policy.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct TransformOptions {
    /// Field paths to strip from the request/response body before transformation.
    pub strip_fields: Vec<String>,
    /// When true, unknown fields in the input are silently preserved.
    /// When false, unknown fields trigger `TransformError::LossyDowngrade`.
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
```

- [ ] **Step 2: 创建 `crates/core/src/transform/field_filter.rs`**

```rust
//! Configurable field stripping for transform bodies.
//!
//! Removes dangerous or provider-specific fields before forwarding.

use serde_json::Value;

/// Recursively remove keys from a JSON value (object and all nested objects).
pub(crate) fn strip_fields(value: &mut Value, fields: &[String]) {
    match value {
        Value::Object(map) => {
            for field in fields {
                map.remove(field.as_str());
            }
            for v in map.values_mut() {
                strip_fields(v, fields);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_fields(v, fields);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_should_strip_top_level_fields() {
        let mut v = json!({"service_tier": "priority", "model": "claude-opus-4-8", "speed": "fast"});
        strip_fields(&mut v, &["service_tier".into(), "speed".into()]);
        assert_eq!(v, json!({"model": "claude-opus-4-8"}));
    }

    #[test]
    fn test_should_strip_nested_fields() {
        let mut v = json!({"outer": {"service_tier": "x", "keep": 1}});
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!({"outer": {"keep": 1}}));
    }

    #[test]
    fn test_should_strip_inside_arrays() {
        let mut v = json!({"items": [{"service_tier": 1}, {"service_tier": 2}]});
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!({"items": [{}, {}]}));
    }

    #[test]
    fn test_should_noop_on_primitives() {
        let mut v = json!("just a string");
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!("just a string"));
    }

    #[test]
    fn test_should_noop_when_fields_absent() {
        let mut v = json!({"model": "claude-opus-4-8"});
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!({"model": "claude-opus-4-8"}));
    }
}
```

- [ ] **Step 3: 在 `transform/mod.rs` 中注册模块**

```rust
mod field_filter;
```

- [ ] **Step 4: 在 `transform/mod.rs` 中 re-export TransformOptions**

```rust
pub use crate::model::TransformOptions;
```

- [ ] **Step 5: 验证编译 + 测试**

```bash
cargo build -p llm-bridge-core 2>&1 | tail -20
cargo test -p llm-bridge-core --lib transform::field_filter 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add crates/core/src/model.rs crates/core/src/transform/field_filter.rs crates/core/src/transform/mod.rs
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "feat(transform): add TransformOptions and field filter (#${ISSUE})"
```

### Task 6: 新建 `transform/thinking.rs`

**Description:** 提供 `reasoning_effort` → `ThinkingConfig` 和 Anthropic thinking → OpenAI `reasoning_content` 的双向映射。

- [ ] **Step 1: 创建 `crates/core/src/transform/thinking.rs`**

实现两个核心函数（参考设计文档 2.5 节）：

```rust
//! Cross-protocol mapping for thinking / reasoning parameters.
//!
//! Maps OpenAI `reasoning_effort` strings to Anthropic `ThinkingConfig` budget
//! values, and Anthropic thinking content to OpenAI `reasoning_content` JSON.

use serde_json::{Value, json};

/// `reasoning_effort` level → thinking token budget.
pub(crate) const REASONING_EFFORT_BUDGETS: &[(&str, u64)] = &[
    ("low", 1280),
    ("medium", 2048),
    ("high", 4096),
];

/// Convert an OpenAI `reasoning_effort` string to an Anthropic thinking budget.
///
/// Returns `None` if the effort string is unrecognized.
pub(crate) fn openai_effort_to_budget(effort: &str) -> Option<u64> {
    REASONING_EFFORT_BUDGETS
        .iter()
        .find(|(k, _)| *k == effort)
        .map(|(_, v)| *v)
}

/// Convert Anthropic thinking content to an OpenAI `reasoning_content` JSON value.
pub(crate) fn anthropic_thinking_to_openai_reasoning(
    thinking_text: &str,
    thinking_usage: Option<u64>,
) -> Value {
    let mut obj = serde_json::Map::new();
    obj.insert("reasoning_content".into(), json!(thinking_text));
    if let Some(usage) = thinking_usage {
        obj.insert("reasoning_tokens".into(), json!(usage));
    }
    Value::Object(obj)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_map_effort_levels() {
        assert_eq!(openai_effort_to_budget("low"), Some(1280));
        assert_eq!(openai_effort_to_budget("medium"), Some(2048));
        assert_eq!(openai_effort_to_budget("high"), Some(4096));
    }

    #[test]
    fn test_should_return_none_for_unknown_effort() {
        assert_eq!(openai_effort_to_budget("minimal"), None);
    }

    #[test]
    fn test_should_convert_thinking_without_usage() {
        let v = anthropic_thinking_to_openai_reasoning("thinking text", None);
        assert_eq!(v["reasoning_content"], "thinking text");
        assert!(v.get("reasoning_tokens").is_none());
    }

    #[test]
    fn test_should_convert_thinking_with_usage() {
        let v = anthropic_thinking_to_openai_reasoning("thinking text", Some(42));
        assert_eq!(v["reasoning_content"], "thinking text");
        assert_eq!(v["reasoning_tokens"], 42);
    }
}
```

- [ ] **Step 2: 在 `transform/mod.rs` 中注册模块**

```rust
mod thinking;
```

- [ ] **Step 3: 验证编译 + 测试**

```bash
cargo build -p llm-bridge-core 2>&1 | tail -20
cargo test -p llm-bridge-core --lib transform::thinking 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add crates/core/src/transform/thinking.rs crates/core/src/transform/mod.rs
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "feat(transform): add thinking/reasoning parameter mapping (#${ISSUE})"
```

### Task 7: 新建 `transform/web_search.rs`

**Description:** 提供 OpenAI `web_search_options` → Anthropic `web_search_20250305` 工具的映射。

- [ ] **Step 1: 创建 `crates/core/src/transform/web_search.rs`**

```rust
//! Cross-protocol mapping for web search tool configuration.
//!
//! Translates OpenAI `web_search_options` into an Anthropic
//! `web_search_20250305` tool definition.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// OpenAI `web_search_options` structure.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct WebSearchOptions {
    /// Search context size: "low", "medium", or "high".
    #[serde(default = "default_context_size")]
    pub search_context_size: String,
    /// Optional user location for geo-targeted results.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_location: Option<WebSearchUserLocation>,
}

/// User location for geo-targeted web search.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct WebSearchUserLocation {
    /// Approximate location fields.
    pub approximate: Option<ApproximateLocation>,
}

/// Approximate geographic location.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ApproximateLocation {
    /// Two-letter country code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// Region or state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    /// City name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    /// IANA timezone.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
}

fn default_context_size() -> String {
    "medium".into()
}

/// Map `search_context_size` to Anthropic `max_uses`.
fn context_size_to_max_uses(size: &str) -> u32 {
    match size {
        "low" => 1,
        "medium" => 5,
        "high" => 10,
        _ => 5,
    }
}

/// Convert OpenAI `web_search_options` to an Anthropic `web_search_20250305` tool.
pub(crate) fn openai_web_search_to_anthropic_tool(options: &WebSearchOptions) -> Value {
    let max_uses = context_size_to_max_uses(&options.search_context_size);
    let mut tool = json!({
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": max_uses,
    });

    if let Some(ref loc) = options.user_location {
        if let Some(ref approx) = loc.approximate {
            let mut user_location = serde_json::Map::new();
            if let Some(ref country) = approx.country {
                user_location.insert("country".into(), json!(country));
            }
            if let Some(ref region) = approx.region {
                user_location.insert("region".into(), json!(region));
            }
            if let Some(ref city) = approx.city {
                user_location.insert("city".into(), json!(city));
            }
            if let Some(ref tz) = approx.timezone {
                user_location.insert("timezone".into(), json!(tz));
            }
            tool.as_object_mut()
                .expect("tool is object")
                .insert("user_location".into(), Value::Object(user_location));
        }
    }

    tool
}

/// Extract and remove `web_search_options` from an OpenAI request body.
///
/// Returns `None` if the field is absent.
pub(crate) fn extract_web_search_options(body: &mut Value) -> Option<WebSearchOptions> {
    let obj = body.as_object_mut()?;
    let raw = obj.remove("web_search_options")?;
    serde_json::from_value(raw).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_should_map_context_sizes() {
        assert_eq!(context_size_to_max_uses("low"), 1);
        assert_eq!(context_size_to_max_uses("medium"), 5);
        assert_eq!(context_size_to_max_uses("high"), 10);
        assert_eq!(context_size_to_max_uses("unknown"), 5);
    }

    #[test]
    fn test_should_convert_basic_web_search() {
        let opts = WebSearchOptions::default();
        let tool = openai_web_search_to_anthropic_tool(&opts);
        assert_eq!(tool["type"], "web_search_20250305");
        assert_eq!(tool["max_uses"], 5);
        assert!(tool.get("user_location").is_none());
    }

    #[test]
    fn test_should_convert_with_user_location() {
        let opts = WebSearchOptions {
            search_context_size: "high".into(),
            user_location: Some(WebSearchUserLocation {
                approximate: Some(ApproximateLocation {
                    country: Some("US".into()),
                    region: Some("CA".into()),
                    city: None,
                    timezone: Some("America/Los_Angeles".into()),
                }),
            }),
        };
        let tool = openai_web_search_to_anthropic_tool(&opts);
        assert_eq!(tool["max_uses"], 10);
        assert_eq!(tool["user_location"]["country"], "US");
        assert_eq!(tool["user_location"]["timezone"], "America/Los_Angeles");
    }

    #[test]
    fn test_should_extract_web_search_options() {
        let mut body = json!({
            "model": "gpt-4",
            "web_search_options": {"search_context_size": "low"}
        });
        let opts = extract_web_search_options(&mut body).unwrap();
        assert_eq!(opts.search_context_size, "low");
        assert!(body.get("web_search_options").is_none());
    }

    #[test]
    fn test_should_return_none_when_absent() {
        let mut body = json!({"model": "gpt-4"});
        assert!(extract_web_search_options(&mut body).is_none());
    }
}
```

- [ ] **Step 2: 在 `transform/mod.rs` 中注册模块**

```rust
mod web_search;
```

- [ ] **Step 3: 验证编译 + 测试**

```bash
cargo build -p llm-bridge-core 2>&1 | tail -20
cargo test -p llm-bridge-core --lib transform::web_search 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add crates/core/src/transform/web_search.rs crates/core/src/transform/mod.rs
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "feat(transform): add web search tool mapping (#${ISSUE})"
```

### Task 8: 新建 `transform/adapter.rs`

**Description:** 定义 `ProtocolAdapter` trait、`AdapterRegistry` 注册表、4 个内置 Adapter 实现。

- [ ] **Step 1: 创建 `crates/core/src/transform/adapter.rs`**

```rust
//! Protocol adapter trait and registry.
//!
//! Each adapter encapsulates one conversion direction. The registry allows
//! callers to look up the right adapter at runtime by (from, to) format pair,
//! so adding a new protocol (e.g., Gemini) only requires registering a new
//! adapter — existing code is untouched.

use std::collections::HashMap;

use crate::model::{ApiFormat, TransformError, TransformOptions, TransformRequest, TransformResponse};

use super::{anthropic_to_openai, openai_to_anthropic};

/// A protocol converter for a specific (source, target) format pair.
pub trait ProtocolAdapter: std::fmt::Debug + Send + Sync {
    /// The target protocol format this adapter produces.
    fn target_format(&self) -> ApiFormat;

    /// Transform a non-streaming request.
    fn convert_request(
        &self,
        request: &TransformRequest,
        options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError>;

    /// Transform a non-streaming response.
    fn convert_response(
        &self,
        response: &TransformResponse,
        options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError>;

    /// Transform request headers.
    fn convert_headers(
        &self,
        headers: &HashMap<String, String>,
    ) -> HashMap<String, String>;
}

/// Runtime registry mapping `(from, to)` format pairs to adapters.
#[derive(Debug, Default)]
pub struct AdapterRegistry {
    adapters: HashMap<(ApiFormat, ApiFormat), Box<dyn ProtocolAdapter>>,
}

impl AdapterRegistry {
    /// Create an empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an adapter for a specific conversion direction.
    pub fn register(
        &mut self,
        from: ApiFormat,
        to: ApiFormat,
        adapter: Box<dyn ProtocolAdapter>,
    ) {
        self.adapters.insert((from, to), adapter);
    }

    /// Look up the adapter for a given (from, to) pair.
    #[must_use]
    pub fn get(&self, from: ApiFormat, to: ApiFormat) -> Option<&dyn ProtocolAdapter> {
        self.adapters.get(&(from, to)).map(|b| b.as_ref())
    }
}

/// Build the default registry pre-populated with all built-in adapters.
#[must_use]
pub fn default_registry() -> AdapterRegistry {
    let mut registry = AdapterRegistry::new();
    registry.register(
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenaiChat,
        Box::new(AnthropicToOpenAiAdapter),
    );
    registry.register(
        ApiFormat::OpenaiChat,
        ApiFormat::AnthropicMessages,
        Box::new(OpenAiToAnthropicAdapter),
    );
    registry.register(
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenaiResponses,
        Box::new(AnthropicToResponsesAdapter),
    );
    registry.register(
        ApiFormat::OpenaiResponses,
        ApiFormat::AnthropicMessages,
        Box::new(ResponsesToAnthropicAdapter),
    );
    registry
}

/// Anthropic Messages → OpenAI Chat adapter.
#[derive(Debug)]
struct AnthropicToOpenAiAdapter;

impl ProtocolAdapter for AnthropicToOpenAiAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::OpenaiChat
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        let resp = anthropic_to_openai(request)?;
        Ok(resp)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        // Anthropic→OpenAI is a request-direction transform; response
        // conversion is handled separately via response_transforms.
        Err(TransformError::InvalidFormat(
            "AnthropicToOpenAiAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        super::transform_headers_anthropic_to_openai(headers)
    }
}

/// OpenAI Chat → Anthropic Messages adapter.
#[derive(Debug)]
struct OpenAiToAnthropicAdapter;

impl ProtocolAdapter for OpenAiToAnthropicAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::AnthropicMessages
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        openai_to_anthropic(request)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        Err(TransformError::InvalidFormat(
            "OpenAiToAnthropicAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        headers.clone()
    }
}

/// Anthropic Messages → OpenAI Responses adapter.
#[derive(Debug)]
struct AnthropicToResponsesAdapter;

impl ProtocolAdapter for AnthropicToResponsesAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::OpenaiResponses
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        super::anthropic_to_openai_responses(request)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        Err(TransformError::InvalidFormat(
            "AnthropicToResponsesAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        headers.clone()
    }
}

/// OpenAI Responses → Anthropic Messages adapter.
#[derive(Debug)]
struct ResponsesToAnthropicAdapter;

impl ProtocolAdapter for ResponsesToAnthropicAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::AnthropicMessages
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        super::responses_to_anthropic(request)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        Err(TransformError::InvalidFormat(
            "ResponsesToAnthropicAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        headers.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_register_and_retrieve_adapter() {
        let registry = default_registry();
        assert!(registry
            .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat)
            .is_some());
        assert!(registry
            .get(ApiFormat::OpenaiChat, ApiFormat::AnthropicMessages)
            .is_some());
        assert!(registry
            .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiResponses)
            .is_some());
        assert!(registry
            .get(ApiFormat::OpenaiResponses, ApiFormat::AnthropicMessages)
            .is_some());
    }

    #[test]
    fn test_should_return_none_for_unregistered_pair() {
        let registry = default_registry();
        assert!(registry.get(ApiFormat::OpenaiChat, ApiFormat::OpenaiResponses).is_none());
    }

    #[test]
    fn test_should_report_correct_target_format() {
        let registry = default_registry();
        let adapter = registry
            .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat)
            .unwrap();
        assert_eq!(adapter.target_format(), ApiFormat::OpenaiChat);
    }

    #[test]
    fn test_should_reject_response_conversion_for_request_adapters() {
        let registry = default_registry();
        let adapter = registry
            .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat)
            .unwrap();
        let resp = TransformResponse {
            headers: HashMap::new(),
            path: String::new(),
            body: bytes::Bytes::new(),
            conversion_trail: vec![],
        };
        let opts = TransformOptions::default();
        let result = adapter.convert_response(&resp, &opts);
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: 在 `transform/mod.rs` 中注册模块并 re-export**

```rust
mod adapter;

pub use adapter::{AdapterRegistry, ProtocolAdapter, default_registry};
```

- [ ] **Step 3: 验证编译 + 测试**

```bash
cargo build -p llm-bridge-core 2>&1 | tail -20
cargo test -p llm-bridge-core --lib transform::adapter 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add crates/core/src/transform/adapter.rs crates/core/src/transform/mod.rs
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "feat(transform): add ProtocolAdapter trait and AdapterRegistry (#${ISSUE})"
```

### Task 9: 重构现有 transform 文件引用新模块

**Description:** 将散落在 `anthropic_to_openai.rs`、`openai_to_anthropic.rs`、`response_transforms.rs`、`anthropic_to_responses.rs` 中的 inline stop reason 字符串替换为 `stop_reason::*` 函数调用。

- [ ] **Step 1: 替换 `anthropic_to_openai.rs` 中的 stop reason 字符串**

将 `"max_tokens".to_string()` 等内联字符串替换为 `stop_reason::canonical_to_openai(StopReason::MaxTokens).to_string()`。

- [ ] **Step 2: 替换 `openai_to_anthropic.rs` 中的 stop reason + thinking + web_search 引用**

- [ ] **Step 3: 替换 `response_transforms.rs` 中的 stop reason 字符串**

将 `openai_finish_to_anthropic` / `anthropic_finish_to_openai` 内联 match 替换为 `stop_reason::*` 函数调用。

- [ ] **Step 4: 替换 `anthropic_to_responses.rs` 中的 stop reason 字符串**

- [ ] **Step 5: 验证所有现有测试通过**

```bash
cargo test -p llm-bridge-core 2>&1 | tail -30
```

- [ ] **Step 6: 运行 clippy**

```bash
cargo clippy -p llm-bridge-core -- -D warnings -W clippy::pedantic 2>&1 | tail -30
```

- [ ] **Step 7: Commit**

```bash
git add crates/core/src/transform/
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "refactor(transform): use centralized stop_reason mapping (#${ISSUE})"
```

### Task 10: 添加 Python fixtures

**Description:** 为新增模块补充 pytest fixtures，验证端到端 JSON 输入输出。

- [ ] **Step 1: 创建 `fixtures/protocol-transform/field-filter/`**

```bash
mkdir -p fixtures/protocol-transform/field-filter
```

- [ ] **Step 2: 创建 `fixtures/protocol-transform/thinking-mapping/`**

```bash
mkdir -p fixtures/protocol-transform/thinking-mapping
```

- [ ] **Step 3: 创建 `fixtures/protocol-transform/web-search-mapping/`**

```bash
mkdir -p fixtures/protocol-transform/web-search-mapping
```

- [ ] **Step 4: 填充 fixture JSON 文件**

每个目录至少包含一个 `{input,expected}.json` 对。具体字段参考设计文档 2.5/2.6 节。

- [ ] **Step 5: 验证 fixture 目录结构**

```bash
ls -R fixtures/protocol-transform/field-filter/ fixtures/protocol-transform/thinking-mapping/ fixtures/protocol-transform/web-search-mapping/
```

- [ ] **Step 6: Commit**

```bash
git add fixtures/
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "test(fixtures): add fixtures for field-filter, thinking, web-search (#${ISSUE})"
```

### Task 11: 集成验证 — 运行 make ci

**Description:** 确保所有变更集成后 CI 全绿。

- [ ] **Step 1: 运行完整 CI**

```bash
make ci 2>&1 | tail -40
```

如果 `make ci` 不可用，依次运行：

```bash
cargo build
cargo test
cargo +nightly fmt -- --check
cargo clippy -- -D warnings -W clippy::pedantic
cargo audit
```

- [ ] **Step 2: 修复所有失败项**

根据 Step 1 输出修复编译错误、测试失败、clippy 告警。

- [ ] **Step 3: 最终 commit（如有修复）**

```bash
git add -A
ISSUE=$(cat .claude/gh-issue/current-issue.txt)
git commit -m "fix: address CI feedback for protocol transform enhancements (#${ISSUE})"
```

- [ ] **Step 4: 确认 Issue 可关闭（开发完成，等待 PR）**

```bash
echo "✅ 所有任务完成。下一步：运行 finishing-a-development-branch 创建 PR。"
```

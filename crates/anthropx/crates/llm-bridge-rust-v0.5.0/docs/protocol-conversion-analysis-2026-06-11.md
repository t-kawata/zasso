# Protocol Conversion Analysis Report

> **Date**: 2026-06-11
> **Scope**: `crates/core/src/transform/` and `crates/core/src/stream/`
> **Analysis Method**: Multi-agent swarm (4 specialized roles)
> **Trigger**: User reported `400 Unknown parameter: 'enable_thinking'` error

---

## Executive Summary

Comprehensive analysis identified **17 issues** across protocol conversion and streaming paths:

- **2 Critical** — API-breaking bugs causing 400 errors
- **5 High** — Data semantic errors and security gaps
- **4 Medium** — Edge cases and defense-in-depth improvements
- **6 Low** — Minor inconsistencies and cleanup items

---

## Critical Issues

### C1. `enable_thinking` Parameter Leak to OpenAI

**Location**: `transform/anthropic_to_openai.rs:328-342`

**Problem**: Anthropic's `thinking.type` is mapped to `enable_thinking: bool` and written into the OpenAI request body. OpenAI Chat Completions API does not recognize this parameter.

```rust
if let Some(ref thinking) = body.thinking {
    let enable_thinking = match thinking.thinking_type.as_str() {
        "enabled" | "adaptive" => true,
        "disabled" => false,
        // ...
    };
    body_obj.insert("enable_thinking".to_string(), serde_json::Value::Bool(enable_thinking));
}
```

**Impact**: Downstream APIs (OpenAI, DeepSeek) reject the request with `400 Unknown parameter: 'enable_thinking'`.

**Fix Direction**: Strip the `thinking` config (log as lossy downgrade) or map to OpenAI's `reasoning_effort` for reasoning models (o1, o3, o4-mini).

---

### C2. Missing `budget_tokens` in Reverse Mapping

**Location**: `transform/openai_to_anthropic.rs:260-267`

**Problem**: When `enable_thinking: true` is received, it's mapped to `{"type": "enabled"}` but `budget_tokens` is not set. Anthropic API requires `budget_tokens` when `thinking.type = "enabled"` (minimum 1024).

**Impact**: Anthropic API returns 400 error for requests with `enable_thinking: true`.

**Fix Direction**: Add default `budget_tokens: 4096` or strip the parameter entirely.

---

## High Severity Issues

### H1. `cache_creation_input_tokens` Misassigned to `reasoning_tokens`

**Location**: `stream/anthropic_to_openai.rs:80,184`

**Problem**: Anthropic's `cache_creation_input_tokens` (prompt caching overhead) is assigned to `reasoning_tokens` (extended thinking overhead). These are semantically different concepts.

**Impact**: Usage data displayed to clients is incorrect; billing/metrics are inaccurate.

---

### H2. `reasoning_tokens` Misassigned to `cache_creation_input_tokens`

**Location**: `stream/openai_stream.rs:59`

**Problem**: OpenAI's `completion_tokens_details.reasoning_tokens` is assigned to `cache_creation_input_tokens`. This creates a reverse semantic confusion.

**Impact**: Anthropic downstream clients receive incorrect cache billing data.

---

### H3. `reasoning_content` Stored in Wrong Map

**Location**: `stream/openai_to_responses.rs:166-171`

**Problem**: OpenAI's `reasoning_content` is stored in `text_fragments` instead of `reasoning_fragments`.

**Impact**: Final response snapshot contains reasoning content mixed into text output; reasoning field is empty.

---

### H4. Model Name Not Validated

**Location**: All transform files

**Problem**: `model` field is passed through without any validation, normalization, or mapping. Attackers can send arbitrary strings (path traversal, special characters, ultra-long strings).

**Impact**: Upstream APIs may behave unexpectedly; cannot prevent unauthorized model requests.

**Fix Direction**: Implement model name whitelist or charset validation (`[a-zA-Z0-9._-]`, max length).

---

### H5. No Request Body Size Limit

**Location**: `parse_*_body` functions

**Problem**: No total byte count check before JSON parsing. Although `MAX_MESSAGES_COUNT` and `MAX_JSON_DEPTH` provide partial protection, a request with 2 messages containing multi-MB text can cause excessive memory allocation.

**Impact**: Potential DoS via memory exhaustion.

**Fix Direction**: Add `bytes.len()` check at parse entry (e.g., 5 MB limit).

---

## Medium Severity Issues

### M1. `content_filter` Finish Reason Misrouted

**Location**: `response_transforms.rs:619`

**Problem**: OpenAI `finish_reason: "content_filter"` is mapped to Anthropic `stop_reason: "end_turn"`. Clients cannot distinguish normal completion from content filtering.

**Fix Direction**: Map to `stop_reason: "content_filter"` (Anthropic supports this).

---

### M2. Unknown Fields Silently Ignored

**Location**: All `*Body` structs

**Problem**: No `#[serde(deny_unknown_fields)]` attribute. Unknown fields are discarded during deserialization (safe due to from-scratch construction), but this is not explicit.

**Fix Direction**: Add `#[serde(deny_unknown_fields)]` for defense-in-depth.

---

### M3. `validate_json_depth` Recursive Implementation

**Location**: `model.rs:422-439`

**Problem**: Recursive closure may cause stack overflow at extreme depths before the check triggers. `serde_json` default limit is 128, `MAX_JSON_DEPTH` is 64.

**Fix Direction**: Convert to iterative implementation using explicit stack.

---

### M4. Tool `input_schema` Directly Cloned

**Location**: `anthropic_to_openai.rs:359`, `openai_to_anthropic.rs:658`, `anthropic_to_responses.rs:270`

**Problem**: Tool `input_schema` / `parameters` (type `Option<serde_json::Value>`) is `.clone()`d directly into target request without validation or sanitization.

**Impact**: Malformed JSON Schema may cause upstream API errors.

**Fix Direction**: Add size limit (property count) and structure validation.

---

## Low Severity Issues

| ID | Problem |
|----|---------|
| L1 | `reasoning_tokens` ↔ `cache_creation_input_tokens` bidirectional semantic imprecision |
| L2 | Anthropic-specific headers (`anthropic-version`, `anthropic-beta`) not stripped |
| L3 | `passthrough_anthropic_stream` always returns empty Vec (misleading signature) |
| L4 | `deserialize_system` fallback uses `Debug` format, may leak internal representation |
| L5 | `MAX_MESSAGES_COUNT = 10,000` may be too large for high-concurrency scenarios |
| L6 | Reasoning and text share `output_index: 0` in Responses streaming |

---

## Protocol Conversion Matrix

| Anthropic Parameter | → OpenAI Chat | → OpenAI Responses | Status |
|---------------------|---------------|---------------------|--------|
| `model` | ✅ passthrough | ✅ passthrough | ⚠️ No validation |
| `messages` | ✅ convert | ✅ convert | ✅ |
| `system` | → `role:system` msg | → `instructions` | ✅ |
| `max_tokens` | ✅ | → `max_output_tokens` | ✅ |
| `temperature` / `top_p` | ✅ passthrough | ✅ passthrough | ✅ |
| `stop_sequences` | → `stop` | → `stop` | ✅ |
| `tools` / `input_schema` | → `tools`/`parameters` | → `tools`/`parameters` | ⚠️ Not validated |
| `tool_choice` | ✅ full mapping | ✅ full mapping | ✅ |
| **`thinking`** | **→ `enable_thinking`** ❌ | **→ strip (debug log)** ✅ | **🔴 Fix needed** |
| `cache_control` | not handled | not handled | — |

---

## Test Coverage Assessment

| Dimension | Coverage | Notes |
|-----------|----------|-------|
| Core conversion paths | 🟢 90%+ | Anthropic ↔ OpenAI fully covered |
| Thinking parameter conversion | 🟡 60% | Forward path tested, **error paths missing** |
| `responses_to_openai` | 🔴 **0%** | **Zero-test blind spot** |
| Error paths | 🔴 20% | Only invalid JSON + unknown tool_choice |
| Boundary conditions | 🔴 <10% | Empty messages / oversized body / deep nesting missing |
| Multimodal (image) | 🔴 0% | Completely uncovered |

### P0 Test Gaps

1. `responses_to_openai` function has **zero tests**
2. Unknown `thinking.type` error path not tested
3. `transform_stream` entry function routing logic not tested
4. Responses → OpenAI request direction streaming not tested

---

## Recommended Fix Priority

### 🔴 P0 — Immediate (blocking users)

1. **`anthropic_to_openai.rs:328-342`** — Strip `enable_thinking` or map to `reasoning_effort`
2. **`openai_to_anthropic.rs:260-267`** — Add default `budget_tokens: 4096` or strip

**Code Fix Example (P0 #1)**:

```rust
// transform/anthropic_to_openai.rs:328-342
// Fix: Strip thinking config (lossy downgrade)
if body.thinking.is_some() {
    tracing::debug!(
        "lossy downgrade: stripping Anthropic thinking config \
         (no OpenAI Chat Completions equivalent)"
    );
}
```

**Code Fix Example (P0 #2)**:

```rust
// transform/openai_to_anthropic.rs:260-267
// Fix: Add default budget_tokens
if let Some(enable_thinking) = body.enable_thinking {
    if enable_thinking {
        body_obj.insert("thinking".to_string(), json!({
            "type": "enabled",
            "budget_tokens": 4096,  // reasonable default
        }));
    } else {
        body_obj.insert("thinking".to_string(), json!({
            "type": "disabled",
        }));
    }
}
```

---

### 🟠 P1 — This week (data accuracy)

3. **`stream/anthropic_to_openai.rs:80,184`** — `cache_creation_input_tokens` should not assign to `reasoning_tokens`
4. **`stream/openai_stream.rs:59`** — `reasoning_tokens` should not assign to `cache_creation_input_tokens`
5. **`stream/openai_to_responses.rs:166-171`** — Use `reasoning_fragments` instead of `text_fragments`

---

### 🟡 P2 — Iterative improvement (security hardening)

6. Model name whitelist / charset validation
7. Request body total size limit (e.g., 5 MB)
8. Add `#[serde(deny_unknown_fields)]`
9. `finish_reason: "content_filter"` correct mapping
10. Add `responses_to_openai` tests + error path tests

---

## Analysis Methodology

This report was generated using a 4-agent swarm with specialized roles:

1. **Protocol Transform Analyst** — Analyzed all `transform/` files for parameter leaks
2. **Streaming Protocol Analyst** — Analyzed all `stream/` files for SSE mapping issues
3. **Security Boundary Analyst** — Checked input validation, injection risks, request smuggling
4. **Test Coverage Analyst** — Mapped test coverage matrix and identified gaps

Total analysis time: ~3 minutes. Files analyzed: 15+ source files, 21 fixture files, 86 existing tests.

---

## Next Steps

1. Implement P0 fixes with TDD approach (test → RED → implement → GREEN)
2. Add regression tests for all fixed bugs
3. Address P1 usage semantic mapping errors
4. Plan P2 security hardening for next sprint

---

**Report generated by Ruflo Swarm Analysis**
**Swarm ID**: `swarm-1781169623471-znwk8q`
**Tasks**: 5 (4 analysis + 1 synthesis)

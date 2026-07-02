# Spec 92: Extend Usage Struct with Cache and Reasoning Token Fields

**Status**: Implemented
**Date**: 2026-05-22
**Scope**: Pure field mapping — no tokenizer library dependency, no protocol logic change.

## Problem

The current `Usage` struct only has `input_tokens` and `output_tokens`.
Upstream APIs (Anthropic, OpenAI) return cache and reasoning fields that are:
- **Ignored** during parsing (not extracted from upstream SSE/response bodies)
- **Hardcoded to 0** in output (e.g., `cached_tokens: 0`, `reasoning_tokens: 0`)

This means downstream clients receive inaccurate billing and metering data.

## Upstream Fields Currently Missing

### Anthropic usage fields
| Field | Current Status |
|-------|---------------|
| `cache_read_input_tokens` | ❌ Not parsed, not output |
| `cache_creation_input_tokens` | ❌ Not parsed, not output |

### OpenAI usage fields
| Field | Current Status |
|-------|---------------|
| `prompt_tokens_details.cached_tokens` | ❌ Hardcoded to `0` in output |
| `completion_tokens_details.reasoning_tokens` | ❌ Hardcoded to `0` in output |

## Solution

### 1. Extend Core Struct

**File**: `crates/core/src/model.rs` (~line 336)

Add 4 fields to `Usage`:

```rust
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    // New:
    pub cache_read_input_tokens: u64,      // Anthropic cache hit
    pub cache_creation_input_tokens: u64,  // Anthropic cache write
    pub cached_tokens: u64,                 // OpenAI cache hit
    pub reasoning_tokens: u64,              // OpenAI/Anthropic reasoning cost
}
```

All default to `0` via `#[serde(default)]`.

### 2. Parse Upstream Fields

#### Anthropic SSE parsing

**File**: `crates/core/src/stream/sse_output.rs` (~line 215)

Extract `cache_read_input_tokens` and `cache_creation_input_tokens` from `message_start` and `message_delta` usage objects.

**File**: `crates/core/src/stream/anthropic_to_responses.rs` (~line 476)

Same extraction from `AnthropicMessageDeltaEvent.usage`.

**File**: `crates/core/src/stream/anthropic_types.rs` (~line 69)

Extend `AnthropicStreamUsage`:

```rust
pub(crate) struct AnthropicStreamUsage {
    pub(crate) input_tokens: Option<u64>,
    pub(crate) output_tokens: Option<u64>,
    pub(crate) cache_read_input_tokens: Option<u64>,        // New
    pub(crate) cache_creation_input_tokens: Option<u64>,    // New
}
```

#### OpenAI SSE parsing

**File**: `crates/core/src/stream/responses_to_anthropic_stream.rs` (~line 119)

Extract `prompt_tokens_details.cached_tokens` and `completion_tokens_details.reasoning_tokens` from the final usage object.

#### OpenAI non-streaming response parsing

**File**: `crates/core/src/transform/response_transforms.rs` (~line 56)

Extend `OpenAiResponseUsage` to parse `prompt_tokens_details` and `completion_tokens_details`:

```rust
#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiResponseUsage {
    pub(crate) prompt_tokens: Option<u64>,
    pub(crate) completion_tokens: Option<u64>,
    pub(crate) prompt_tokens_details: Option<PromptTokensDetails>,       // New
    pub(crate) completion_tokens_details: Option<CompletionTokensDetails>, // New
}

#[derive(Debug, Deserialize)]
pub(crate) struct PromptTokensDetails {
    #[serde(default)]
    pub(crate) cached_tokens: u64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CompletionTokensDetails {
    #[serde(default)]
    pub(crate) reasoning_tokens: u64,
}
```

### 3. Output Mapping

#### Field Mapping Table

| Anthropic → OpenAI | OpenAI → Anthropic |
|---|---|
| `cache_read_input_tokens` → `prompt_tokens_details.cached_tokens` | `prompt_tokens_details.cached_tokens` → `cache_read_input_tokens` |
| `cache_creation_input_tokens` → (no OpenAI equivalent, omit) | `completion_tokens_details.reasoning_tokens` → preserve |

#### Streaming Output

**File**: `crates/core/src/stream/openai_stream.rs` (~line 202)

`openai_usage_json()`: Add `prompt_tokens_details` and `completion_tokens_details` objects with values from `state.last_usage` instead of hardcoding.

**File**: `crates/core/src/stream/anthropic_to_responses.rs` (~line 708)

`responses_usage_json()`: **Remove hardcoded `0`** — read `cached_tokens` and `reasoning_tokens` from `state.last_usage`.

#### Non-Streaming Output

**File**: `crates/core/src/transform/response_transforms.rs`

- OpenAI→Anthropic response body: Add `cache_read_input_tokens` and `cache_creation_input_tokens` to `usage` object.
- Anthropic→OpenAI response body: Add `prompt_tokens_details` and `completion_tokens_details` objects.

## Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `crates/core/src/model.rs` | Extend `Usage` struct | ~10 new |
| `crates/core/src/stream/anthropic_types.rs` | Extend `AnthropicStreamUsage` | ~4 new |
| `crates/core/src/stream/sse_output.rs` | Parse cache fields from SSE | ~15 new |
| `crates/core/src/stream/anthropic_to_responses.rs` | Parse cache fields + fix `responses_usage_json()` | ~20 new |
| `crates/core/src/stream/responses_to_anthropic_stream.rs` | Parse OpenAI details fields | ~15 new |
| `crates/core/src/stream/openai_stream.rs` | Add details to `openai_usage_json()` | ~10 new |
| `crates/core/src/transform/response_transforms.rs` | Parse + output cache/reasoning in non-streaming | ~30 new |

**Total**: ~100 lines of new code across 7 files.

## Testing

1. **Anthropic → OpenAI streaming**: Feed Anthropic SSE with `cache_read_input_tokens: 200`, verify OpenAI output has `cached_tokens: 200` (not `0`).
2. **OpenAI → Anthropic streaming**: Feed OpenAI SSE with `cached_tokens: 150`, verify Anthropic output has `cache_read_input_tokens: 150`.
3. **Non-streaming**: Verify both directions include cache/reasoning fields in response body.
4. **Backwards compatibility**: Response without cache fields should still work (all new fields default to `0`).

## Scope Boundaries

- **IN scope**: Pure JSON field extraction and mapping.
- **OUT of scope**: Token counting logic, tokenizer library integration, local token computation.

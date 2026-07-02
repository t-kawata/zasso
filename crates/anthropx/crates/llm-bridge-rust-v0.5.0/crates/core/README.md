# llm-bridge-core

Protocol transform library for LLM API translation between Anthropic and OpenAI.

[![CI](https://github.com/TokenFleet-AI/llm-bridge-rust/actions/workflows/ci.yml/badge.svg)](https://github.com/TokenFleet-AI/llm-bridge-rust/actions/workflows/ci.yml)
[![crates.io](https://img.shields.io/crates/v/llm-bridge-core.svg)](https://crates.io/crates/llm-bridge-core)
[![docs.rs](https://img.shields.io/docsrs/llm-bridge-core)](https://docs.rs/llm-bridge-core)
[![license](https://img.shields.io/crates/l/llm-bridge-core)](LICENSE)

## Overview

`llm-bridge-core` is a Rust library that translates request payloads, response payloads, and streaming SSE events between the Anthropic Messages API and OpenAI-compatible APIs (Chat Completions and Responses). It is library-first, protocol-only, and has zero gateway concerns — no auth, billing, routing, or rate-limiting.

No feature flags are required; all capabilities are included by default. No workspace-internal dependencies — it can be used standalone from crates.io.

## Features

- **Anthropic → OpenAI Chat Completions**: Convert Anthropic Messages requests to OpenAI Chat Completions format
- **Anthropic → OpenAI Responses**: Convert Anthropic Messages requests to OpenAI Responses format
- **OpenAI Chat Completions → Anthropic**: Convert OpenAI Chat Completions requests back to Anthropic Messages
- **OpenAI Responses → Anthropic**: Convert OpenAI Responses requests back to Anthropic Messages
- **Streaming**: Cross-protocol SSE → SSE translation with cross-chunk state management
- **Thinking**: Anthropic `thinking` blocks ↔ OpenAI `reasoning` content translation
- **Tool use**: Cross-protocol tool call / tool result translation with semantic equivalence
- **Response transforms**: Anthropic response → OpenAI/Responses format for upstream response mapping
- **Header transforms**: Automatic `content-type` detection and `x-no-response-completion` handling

Unsupported fields are logged before omission rather than silently dropped.

## Installation

```toml
[dependencies]
llm-bridge-core = "0.2"
```

MSRV: Rust 1.80+ (edition 2024).

## Quick Start

### Non-streaming

```rust
use llm_bridge_core::model::{TransformRequest, TransformResponse};
use llm_bridge_core::transform;

let req = TransformRequest::builder()
    .path("/v1/messages")
    .body(anthropic_json_bytes)
    .build();

// Anthropic → OpenAI Chat Completions
let response: TransformResponse = transform::anthropic_to_openai(&req)?;

// Anthropic → OpenAI Responses
let response: TransformResponse = transform::anthropic_to_openai_responses(&req)?;

// OpenAI Chat Completions → Anthropic
let response: TransformResponse = transform::openai_to_anthropic(&req)?;

// OpenAI Responses → Anthropic
let response: TransformResponse = transform::responses_to_anthropic(&req)?;
```

### Streaming

```rust
use llm_bridge_core::model::{ApiFormat, StreamState};
use llm_bridge_core::stream;

let mut state = StreamState::default();

// Parse SSE frames and get structured events
let events = stream::transform_stream_events(sse_bytes, ApiFormat::OpenaiChat, &mut state)?;

// Or convert directly to target SSE bytes
let anthropic_sse = stream::transform_stream_to_anthropic_sse(
    sse_bytes, ApiFormat::OpenaiChat, &mut state,
)?;
let openai_sse = stream::transform_stream_to_openai_sse(
    sse_bytes, ApiFormat::AnthropicMessages, &mut state,
)?;
```

## Key Types

The public API is organized into three modules:

| Module | Key Types | Purpose |
|---|---|---|
| `model` | `TransformRequest`, `TransformResponse`, `TransformError`, `ApiFormat`, `ContentBlock`, `StreamEvent`, `StreamState`, `Usage`, `StopReason` | Core data model and error types |
| `transform` | `anthropic_to_openai`, `openai_to_anthropic`, `responses_to_anthropic`, `anthropic_to_openai_responses`, `transform_stream`, etc. | Non-streaming and streaming protocol transforms |
| `stream` | `transform_stream_events`, `transform_stream_to_anthropic_sse`, `transform_stream_to_openai_sse`, `SseFrame`, `parse_sse_frames`, `events_to_sse` | Low-level SSE parsing and streaming transform primitives |

## Error Handling

All transforms return `Result<_, TransformError>`. The error enum provides structured variants you can match on:

| Variant | When |
|---|---|
| `InvalidFormat` | Malformed JSON or unsupported format |
| `MissingRequiredField` | Required field absent in request/response |
| `BufferLimitExceeded` | Input exceeds resource limits (see below) |
| `StreamInterrupted` | SSE stream ended unexpectedly |
| `UpstreamError` | Upstream provider returned an error |
| `LossyDowngrade` | Field unsupported by target protocol (logged, then omitted) |

Use `TransformError::sanitized_message()` for safe client-facing error strings.

## Resource Limits

| Constant | Value | Purpose |
|---|---|---|
| `MAX_SSE_STREAM_BYTES` | 1 MB | Maximum total SSE data processed per stream chunk |
| `MAX_MESSAGES_COUNT` | 10,000 | Maximum messages per request |
| `MAX_JSON_DEPTH` | 64 | Maximum JSON nesting depth for input validation |

## Protocol Translation Matrix

### Non-streaming

| Source → Target | Function | Status |
|---|---|---|
| Anthropic → OpenAI Chat Completions | `transform::anthropic_to_openai` | ✓ |
| OpenAI Chat Completions → Anthropic | `transform::openai_to_anthropic` | ✓ |
| Anthropic → OpenAI Responses | `transform::anthropic_to_openai_responses` | ✓ |
| OpenAI Responses → Anthropic | `transform::responses_to_anthropic` | ✓ |

### Response Transforms

| Transform | Function |
|---|---|
| Anthropic response → OpenAI Chat format | `transform::anthropic_response_to_openai_response` |
| Anthropic response → OpenAI Responses format | `transform::anthropic_response_to_responses_response` |
| OpenAI response → Anthropic format | `transform::openai_response_to_anthropic_message` |

### Streaming

| Source SSE → Target SSE | Function | Status |
|---|---|---|
| OpenAI Chat → Anthropic | `stream::transform_stream_to_anthropic_sse` | ✓ |
| OpenAI Responses → Anthropic | `stream::transform_stream_to_anthropic_sse` | ✓ |
| Anthropic → OpenAI Chat Completions | `stream::transform_stream_to_openai_sse` | ✓ |
| Anthropic → OpenAI Responses | `stream::transform_stream_to_openai_responses_sse` | ✓ |

Same-protocol passthrough (e.g., Anthropic → Anthropic) is handled outside the transform core — it is a caller/proxy concern.

## Crate Structure

```
crates/core/src/
├── lib.rs              # Public API: model, stream, transform modules
├── model.rs            # Core types, errors, resource limits, validation
├── transform/          # Non-streaming protocol translation
│   ├── mod.rs          # Public re-exports
│   ├── anthropic_to_openai.rs
│   ├── anthropic_to_responses.rs
│   ├── openai_to_anthropic.rs
│   ├── responses_to_anthropic.rs
│   ├── response_transforms.rs
│   ├── header_helpers.rs
│   ├── shared.rs
│   ├── streaming_entry.rs
│   └── tests.rs
├── stream/             # Streaming SSE protocol translation
│   ├── mod.rs          # Public re-exports and stream dispatcher
│   ├── sse_parser.rs   # SSE frame parser
│   ├── sse_output.rs   # SSE serialization (events → SSE)
│   ├── frame_dispatch.rs
│   ├── anthropic_to_openai.rs
│   ├── anthropic_to_responses.rs
│   ├── responses_to_anthropic_stream.rs
│   ├── openai_stream.rs
│   ├── openai_types.rs
│   ├── anthropic_types.rs
│   ├── stream_helpers.rs
│   └── tests.rs
├── examples/           # Runnable examples (see below)
│   ├── basic_nonstream.rs
│   ├── all_transforms.rs
│   ├── streaming_text.rs
│   ├── streaming_tool_use.rs
│   ├── error_handling.rs
│   ├── chat-roundtrip.rs
│   └── http-proxy.rs
└── tests/              # Integration tests
    └── end_to_end_fixtures.rs
```

## Running Examples

All examples are self-contained (except `http-proxy` which needs API keys). No network access required.

```bash
cargo run --example basic_nonstream       # Anthropic → OpenAI non-streaming
cargo run --example all_transforms        # All transform paths comparison
cargo run --example streaming_text        # OpenAI SSE → Anthropic SSE text stream
cargo run --example streaming_tool_use    # Streaming tool call translation
cargo run --example error_handling        # Error handling patterns
cargo run --example chat-roundtrip        # Anthropic ↔ OpenAI roundtrip verification
```

For the HTTP proxy example with primary/backup failover, see `examples/README.md`.

## Safety

`#![forbid(unsafe_code)]` — this crate contains zero `unsafe` code.

## Documentation

- **API docs**: [docs.rs/llm-bridge-core](https://docs.rs/llm-bridge-core)
- **Examples**: [examples/README.md](examples/README.md)
- **Project specs**: [specs/](https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master/specs)
- **Research docs**: [docs/](https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master/docs)
- **Server crate**: [apps/server](https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master/apps/server)

## Versioning

This crate follows semantic versioning. Breaking changes to the transform API bump the minor version while the major version is `0`.

## License

MIT

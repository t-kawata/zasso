[![CI](https://github.com/TokenFleet-AI/llm-bridge-rust/actions/workflows/ci.yml/badge.svg)](https://github.com/TokenFleet-AI/llm-bridge-rust/actions/workflows/ci.yml)
[![Crates.io](https://img.shields.io/crates/v/llm-bridge-core?logo=rust)](https://crates.io/crates/llm-bridge-core)
[![docs.rs](https://img.shields.io/docsrs/llm-bridge-core)](https://docs.rs/llm-bridge-core)
[![Release](https://img.shields.io/github/v/tag/TokenFleet-AI/llm-bridge-rust?sort=semver)](https://github.com/TokenFleet-AI/llm-bridge-rust/tags)
[![Rust 2024](https://img.shields.io/badge/Rust-2024-orange?logo=rust)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

# LLM Bridge

> Multi-protocol LLM API bridge — seamless interoperability between Anthropic and OpenAI-compatible interfaces.

`llm-bridge` is a Rust-first protocol translation layer for teams that want to accept one LLM API shape at the edge and talk to a different upstream provider internally. It translates request payloads, response payloads, and streaming SSE events while keeping protocol semantics explicit.

Use it when you want protocol interoperability without coupling auth, billing, routing, retries, or token optimization into the translation core.

Chinese docs: [README.zh-CN.md](README.zh-CN.md). Detailed design and delivery docs live in [specs/index.md](specs/index.md) and [docs/index.md](docs/index.md).

**Quick links:** [Quick Start](#quick-start) · [Why LLM Bridge](#why-llm-bridge) · [Highlights](#highlights) · [When to Use](#when-to-use) · [Current Status](#current-status) · [Architecture](#architecture) · [Protocol Translation Matrix](#protocol-translation-matrix) · [Build & Development](#build--development) · [Changelog](CHANGELOG.md)

## Quick Start

Add `llm-bridge-core` to your project:

```bash
cargo add llm-bridge-core
```

Or in `Cargo.toml`:

```toml
[dependencies]
llm-bridge-core = "0.2"
```

Minimal example — convert an Anthropic request to OpenAI Chat Completions:

```rust
use llm_bridge_core::model::{TransformRequest, TransformResponse};
use llm_bridge_core::transform;

let req = TransformRequest::builder()
    .path("/v1/messages")
    .body(anthropic_request_bytes)
    .build();

let openai_response: TransformResponse = transform::anthropic_to_openai(&req)?;
```

More examples in [`crates/core/examples/`](crates/core/examples/) — covering streaming, tool use, error handling, and a full HTTP proxy.

MSRV: Rust 1.85+ (edition 2024). See [docs.rs/llm-bridge-core](https://docs.rs/llm-bridge-core) for full API documentation.

## Why LLM Bridge

- **Protocol-only scope**: focus on semantic translation instead of gateway concerns
- **Streaming-aware**: convert SSE event streams with cross-chunk state, not just one-shot payloads
- **Library-first**: embed `crates/core` into any Rust process. A reference HTTP/SSE server is available in `crates/core/examples/http-proxy.rs`.
- **Explicit downgrade behavior**: unsupported fields are logged before omission rather than silently dropped

## Highlights

| Area | What you get |
| --- | --- |
| Protocol coverage | Anthropic Messages ↔ OpenAI Chat Completions / Responses |
| Streaming | Cross-protocol SSE → SSE translation for all implemented cross-protocol paths |
| Translation semantics | Request, response, and event-shape mapping designed to preserve meaning, not just field names |
| Embedding model | Pure Rust core library with examples; standalone server planned |

## When to Use

**Use** `llm-bridge` when you:

- need Anthropic/OpenAI-compatible clients to talk to a different upstream protocol
- want protocol translation as a focused Rust component inside your own gateway or service
- need fixture-backed non-streaming and streaming conversions for interoperability testing

**Don't use** `llm-bridge` if you:

- need a full API gateway with auth, billing, routing, failover, or token optimization built in
- only need same-protocol passthrough with no translation
- expect business-logic orchestration on top of model calls

## Current Status

The core cross-protocol matrix is implemented for non-streaming flows, and the streaming transform API already covers all currently supported cross-protocol directions:

- **Anthropic → OpenAI Chat Completions**
- **Anthropic → OpenAI Responses**
- **OpenAI Chat Completions → Anthropic**
- **OpenAI Responses → Anthropic**

Same-protocol passthrough remains a caller/proxy concern rather than a protocol-core responsibility. The `Usage` struct now includes cache and reasoning token fields (`cache_read_input_tokens`, `cache_creation_input_tokens`, `cached_tokens`, `reasoning_tokens`) with full SSE parsing and output mapping for all transform paths.

## Architecture

```
Client Request (Anthropic / OpenAI)
  │
  ▼
Auth / RateLimit / Billing    ← external to this crate
  │
  ▼
Token Optimizer (optional)    ← external to this crate
  │
  ▼
┌──────────────────────────┐
│  crates/core (Rust)      │  ← single source of protocol semantics
│  Protocol Translation ·   │
│  Streaming State Machine  │
└──────────────────────────┘
  │
  ▼
Forwarder (CircuitBreaker + Failover)  ← external to this crate
  │
  ▼
Upstream Provider (OpenAI / Anthropic)
```

**Streaming note**: The streaming transform in `crates/core` is a pure protocol-layer SSE → SSE conversion (async stream → async stream). It does not start any HTTP server. HTTP listening, request parsing, and response writing are handled by the upper-level server/forwarder.

## Protocol Translation Matrix

| Client Protocol → Upstream Protocol | Frequency | Status |
|---|---|---|
| Anthropic → OpenAI Chat Completions | Highest | Core path |
| Anthropic → OpenAI Responses | Medium | Implemented |
| Anthropic → Anthropic | Medium | Passthrough, no translation |
| OpenAI Chat Completions → OpenAI Chat Completions | Medium | Passthrough, no translation |
| OpenAI Responses → OpenAI Responses | Medium | Passthrough, no translation |
| OpenAI Chat Completions → Anthropic | Low | Reverse compatibility |
| OpenAI Responses → Anthropic | Low | Implemented |

## Streaming Translation Status

Non-streaming request/response handling covers the matrix above. Same-protocol passthrough routes are caller/proxy concerns and do not require protocol conversion. The current streaming transform API outputs SSE event sequences for all cross-protocol paths:

| Input Stream → Output Stream | Status |
|---|---|
| OpenAI Chat SSE → Anthropic SSE | ✓ Implemented |
| OpenAI Responses SSE → Anthropic SSE | ✓ Implemented |
| Anthropic SSE → OpenAI Chat Completions SSE | ✓ Implemented |
| Anthropic SSE → OpenAI Responses SSE | ✓ Implemented |

Additionally, the current streaming API is synchronous (`&[u8]` → `Vec<u8>`) — an async `Stream<Item = Bytes>` → `Stream<Item = Bytes>` wrapper is planned for third-party integration convenience.

## Project Structure

```
llm-bridge/
├── crates/
│   └── core/          # Protocol translation core library (non-streaming + streaming)
│       └── examples/  # Runnable examples (basic, streaming, error handling, proxy)
├── specs/             # Design documents (PRD, design, roadmap, impl-plan, decisions)
├── fixtures/          # Protocol translation test fixtures
│   └── protocol-transform/
│       ├── anthropic-to-openai/
│       ├── openai-to-anthropic/
│       └── end-to-end/
└── docs/              # Usage guides, process docs, and technical references
```

## Examples

The `crates/core/examples/` directory contains runnable, self-contained examples for every major feature:

| Example | Description |
|---|---|
| `basic_nonstream` | Minimal Anthropic → OpenAI non-streaming transform |
| `all_transforms` | All supported transform paths comparison |
| `streaming_text` | OpenAI SSE → Anthropic SSE text stream |
| `streaming_tool_use` | Streaming tool call translation |
| `error_handling` | Error handling patterns (invalid JSON, missing fields, etc.) |
| `chat-roundtrip` | Anthropic ↔ OpenAI bidirectional verification |
| `http-proxy` | Full HTTP proxy with primary/backup failover |

```bash
cargo run --example basic_nonstream
cargo run --example streaming_text
cargo run --example http-proxy
```

All examples are self-contained and require no network access (except `http-proxy` which needs API keys).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on PRs, testing, and code style. For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Freeze fixture corpus, confirm risk boundaries | Done |
| Phase 1 | Rust core foundation: type definitions, Anthropic→OpenAI non-streaming | Done |
| Phase 2 | Streaming core: SSE parsing, state machine, Anthropic event output | Done |
| Phase 3 | Reverse compatibility: OpenAI→Anthropic and fixture hardening | Done |
| Phase 4 | Quality gate: full test coverage, clippy, performance validation | Done |
| Phase 5 | OpenAI Responses API: request/response + streaming transforms | Done |

## Tech Stack

- **Language**: Rust 2024 Edition
- **Async runtime**: Tokio
- **Serialization**: serde + serde_json
- **Error handling**: thiserror (library) + anyhow (application)
- **Testing**: rstest (parameterized) + insta (snapshot) + proptest (property-based)
- **Logging**: tracing + tracing-subscriber

## Build & Development

```bash
# Build
make build

# Check
make check

# Test (cargo-nextest)
make test

# Format + lint
make lint

# CI-style local verification
make ci

# Generate docs
make doc

# Security audit
cargo audit

# Dependency policy check
cargo deny check
```

## License

This project is licensed under the Apache License, Version 2.0.

See [LICENSE](LICENSE) for details.

Copyright 2020-2026 TokenFleet-AI

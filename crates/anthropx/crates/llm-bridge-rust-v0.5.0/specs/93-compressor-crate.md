# Spec 93: Compressor Crate — Payload Optimization Middleware

**Status**: Proposed
**Date**: 2026-05-22
**Scope**: New `crates/compressor` crate for request/response payload compression.
**Inspiration**: Anolisa Tokenless / RTK (Rust Token Killer) — schema compression, command rewriting, output filtering.

## Problem

LLM agents (Claude Code, Cursor, etc.) send heavily redundant payloads:
- Tool definitions with verbose JSON Schema (hundreds of tokens)
- CLI command outputs (git status, ls) with mostly noise
- Repeated system prompts across requests

These waste token budget and increase cost. The protocol transform layer (`crates/core`) does not and should not handle this — it's pure format translation.

## Solution

Add a **separate, optional** `crates/compressor` that sits **before** protocol transform:

```
Client → Compressor (compress/filter) → Core (protocol transform) → Upstream
```

## Architecture

### Crate Structure

```
llm-bridge-rust/
├── crates/
│   ├── core/           ← Protocol transform only (unchanged)
│   └── compressor/     ← NEW: Payload optimization
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── schema.rs        # JSON Schema compression
│           ├── cli_filter.rs    # CLI command output rewriting
│           ├── prompt_cache.rs  # System prompt dedup
│           └── config.rs        # Compression rules config
└── apps/
    └── server/         ← http-proxy, optionally enables compressor
```

### Workspace Integration

**Root `Cargo.toml`**:
```toml
[workspace.dependencies]
llm-bridge-compressor = { path = "crates/compressor" }
```

**`crates/compressor/Cargo.toml`**:
```toml
[package]
name = "llm-bridge-compressor"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
```

No external dependencies beyond workspace — pure Rust string/JSON manipulation.

## Compression Modules

### 1. Schema Compression (`schema.rs`)

Compress tool definitions in LLM API requests:

| Technique | Example | Savings |
|-----------|---------|---------|
| Remove `description` fields | Long tool descriptions → short labels | 20-40% |
| Abbreviate field names | `file_path` → `fp`, `content` → `c` | 10-20% |
| Remove `required` arrays | Keep schema structure, drop constraints | 5-10% |
| Collapse nested types | Flatten `properties` nesting where possible | 5-10% |

**When**: Applied to requests containing `tools` arrays (function calling).

**Risk**: Model may not understand abbreviated names. Solution: maintain a **mapping table** that both compressor and response parser use.

### 2. CLI Filter (`cli_filter.rs`)

Rewrite/filter CLI command outputs in user messages:

| Command | Original | Compressed | Savings |
|---------|----------|------------|---------|
| `git status` | Full output with all untracked files | Summary + top N changed files | 60-90% |
| `ls -la` | All file details | File count + key directories | 40-70% |
| `find .` | All file paths | Directory tree summary | 50-80% |
| Error traces | Full stacktrace | Top-level error + line count | 30-50% |

**When**: Applied to `user` message content blocks containing recognizable CLI output patterns.

**Detection**: Regex matching on command signatures (`$ git`, `total \d+`, `Permission denied at`, etc.)

### 3. Prompt Cache (`prompt_cache.rs`)

Detect repeated system prompts across requests:

- Hash system prompt content
- If same hash as previous request, mark as `cached`
- Optionally strip from request body (if upstream supports prompt caching)
- Track cache hit/miss ratio

**When**: Applied to `system` blocks in request messages.

## Config

```toml
# compressor.toml
[schema]
enabled = true
max_description_length = 50  # chars, longer descriptions are truncated
abbreviate_fields = true

[cli_filter]
enabled = true
git_max_untracked = 5  # show only 5 untracked files
ls_show_dotfiles = false

[prompt_cache]
enabled = true
```

## Request/Response Flow

```
POST /v1/messages (Anthropic format)
    ↓
┌───────────────────────────────────┐
│ Compressor                        │
│                                   │
│ 1. Parse request body             │
│ 2. Apply schema compression       │
│    (tools[].input_schema)         │
│ 3. Apply CLI filter               │
│    (user messages with CLI output)│
│ 4. Apply prompt cache             │
│    (system message dedup)         │
│ 5. Record token savings metrics   │
└──────────┬────────────────────────┘
           ↓ Compressed body
┌───────────────────────────────────┐
│ Core Protocol Transform           │
│ (crates/core — unchanged)         │
│                                   │
│ Anthropic → OpenAI format         │
└──────────┬────────────────────────┘
           ↓
      Upstream API
```

## Metrics

The compressor exposes a `CompressStats` struct:

```rust
pub struct CompressStats {
    pub original_tokens: u64,
    pub compressed_tokens: u64,
    pub savings_pct: f64,
    pub schema_compressed: bool,
    pub cli_filtered: bool,
    pub prompt_cache_hit: bool,
}
```

This can be logged or exposed via a `/metrics` endpoint for monitoring.

## Non-Goals

- **NOT** tokenization — compressor works on raw text/JSON, not token IDs
- **NOT** protocol transformation — that's `core`'s job
- **NOT** lossless — compression is intentionally lossy (descriptions truncated, CLI output summarized)
- **NOT** required — http-proxy can run without compressor

## Files to Create/Modify

| File | Action | Lines |
|------|--------|-------|
| `crates/compressor/Cargo.toml` | Create | ~15 |
| `crates/compressor/src/lib.rs` | Create | ~50 |
| `crates/compressor/src/schema.rs` | Create | ~80 |
| `crates/compressor/src/cli_filter.rs` | Create | ~120 |
| `crates/compressor/src/prompt_cache.rs` | Create | ~60 |
| `crates/compressor/src/config.rs` | Create | ~40 |
| `Cargo.toml` (root) | Modify: add workspace dep | ~1 |
| `apps/server/Cargo.toml` | Modify: add compressor dep | ~1 |
| `apps/server/src/main.rs` | Modify: wire compressor into proxy | ~30 |
| `specs/index.md` | Modify: add this spec to index | ~1 |

**Total**: ~400 lines new code across 10 files.

## Implementation Phases

### Phase 1: Skeleton
- Create crate, wire into workspace
- Implement `Compressor` struct with `compress(request) -> (body, stats)` method
- No actual compression yet, just passthrough

### Phase 2: Schema Compression
- JSON Schema tool definition compression
- Field abbreviation mapping
- Test against real tool definitions

### Phase 3: CLI Filter
- Regex-based CLI output detection
- Git status, ls, find, error trace filtering
- Test against real Claude Code sessions

### Phase 4: Prompt Cache
- System prompt hash + dedup
- Cache hit tracking
- Integration with prompt caching providers

### Phase 5: Integration
- Wire into http-proxy server
- Add `/metrics` endpoint for compress stats
- Config file loading

## Testing

1. **Schema**: Feed a 50-tool definition request, verify compressed output is valid JSON and model can still parse it
2. **CLI**: Feed `git status` with 200 untracked files, verify output shows summary + top 5
3. **End-to-end**: Run http-proxy with compressor enabled, verify upstream receives compressed payload
4. **Backwards**: Run http-proxy without compressor (feature flag off), verify passthrough is identity

## Scope Boundaries

- **IN scope**: Text/JSON compression, CLI filtering, prompt dedup, metrics
- **OUT of scope**: Tokenization, protocol transformation, model-specific logic

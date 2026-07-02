# Protocol Transform — Lossy Downgrade Checklist

Status: frozen for Phase 1 · Source: [10-protocol-transform-design.md §4.3](./10-protocol-transform-design.md#43-unsupported-and-lossy-features)

## Principle

Per invariant I2 (Explicit lossy downgrade): any field marked "unsupported" in this checklist **must be explicitly omitted and logged at debug level**. Silent drops are bugs.

## Anthropic → OpenAI Chat

| Source field | Action | Log message hint |
| --- | --- | --- |
| `cache_control` | Omit | `dropping unsupported field: cache_control` |
| `thinking` (request-side) | Omit | `dropping unsupported field: thinking (not supported in OpenAI Chat)` |
| `document` | Omit | `dropping unsupported field: document` |
| `container` | Omit | `dropping unsupported field: container` |
| `metadata` | Omit | `dropping unsupported field: metadata` |

## OpenAI Chat → Anthropic Messages

| Source field | Action | Log message hint |
| --- | --- | --- |
| `response_format` / structured outputs | Omit | `dropping unsupported field: response_format` |
| `logprobs` | Omit | `dropping unsupported field: logprobs` |
| `audio` | Omit | `dropping unsupported field: audio` |
| `prediction` | Omit | `dropping unsupported field: prediction` |
| `parallel_tool_calls` | Omit | `dropping unsupported field: parallel_tool_calls` |

## Logging discipline

- All downgrade logs use `tracing::debug!` level.
- Log messages **must not** contain request bodies, secrets, or image download data.
- Each downgrade should be logged **once per transform call**, not per-chunk.

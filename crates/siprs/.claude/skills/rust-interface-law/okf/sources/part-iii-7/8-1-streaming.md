---
type: "Section"
title: "8.1 Streaming"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/8-1-streaming"
    title: "8.1 Streaming"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/8-1-streaming"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4375-4375"
---
### 8.1 Streaming

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-23 | `StreamOpen` creates a stream; the server sends `StreamItem` messages followed by exactly one `StreamEnd`. | Lifecycle. | Item encoding. | V3 test. |
| WS-24 | A client stream sends `StreamItem` messages and then `StreamClose`; the server replies with `Response` or `Error`. | Lifecycle. | Item encoding. | V3 test. |
| WS-25 | `StreamCancel` is idempotent, propagates to the operation, and ends with `StreamEnd::Cancelled`. | Cancellation. | Timing. | V3 test. |
| WS-26 | A bidi stream has independent half-close for input and output. | Half-close. | Encoding. | V3 test. |
| WS-27 | Backpressure applies to stream items; an overflow closes with 1013. | Bound. | Threshold. | V3 load test. |
| WS-28 | `stream_id` is unique per connection and is released on `StreamEnd`. | Uniqueness. | Format. | V3 test. |
| WS-29 | The adapter calls the dispatcher's stream methods; it does not implement business streaming. | Call path. | — | V3 bypass test. |

### 8.2 Protocol-owned resources

## Rules in this section

- [WS-23 — `StreamOpen` creates a stream; the server sends `StreamItem` messages followe...](../../rules/c/ws-23.md)
- [WS-24 — A client stream sends `StreamItem` messages and then `StreamClose`; the serve...](../../rules/c/ws-24.md)
- [WS-25 — `StreamCancel` is idempotent, propagates to the operation, and ends with `Str...](../../rules/c/ws-25.md)
- [WS-26 — A bidi stream has independent half-close for input and output.](../../rules/c/ws-26.md)
- [WS-27 — Backpressure applies to stream items; an overflow closes with 1013.](../../rules/c/ws-27.md)
- [WS-28 — `stream_id` is unique per connection and is released on `StreamEnd`.](../../rules/c/ws-28.md)
- [WS-29 — The adapter calls the dispatcher's stream methods; it does not implement busi...](../../rules/c/ws-29.md)


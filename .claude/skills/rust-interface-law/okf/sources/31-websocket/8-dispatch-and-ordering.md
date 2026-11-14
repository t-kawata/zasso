---
type: "Section"
title: "8. Dispatch and Ordering"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-8-dispatch-and-ordering"
    title: "8. Dispatch and Ordering"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "235-268"
---
## 8. Dispatch and Ordering

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-10 | Each request carries a `request_id`; the response carries the same ID. | Correlation. | ID generation. | V3 test. |
| WS-11 | Concurrent requests may interleave. | Allowed. | Concurrency limit. | V3 test. |
| WS-12 | Mutations to the same resource preserve a defined order. | Per-resource FIFO. | Queue implementation. | V3 ordering test. |
| WS-13 | No global ordering is promised. | Non-guarantee documented. | — | V4 review. |
| WS-14 | The adapter calls `Dispatcher::execute_verified`; it does not call handlers directly. | Call path. | — | V3 bypass test. |

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

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-30 | The adapter authorizes protocol-owned subscriptions and streams against the connection identity. | Adapter auth. | Policy. | V3 test. |
| WS-31 | The adapter MUST NOT authorize business resources; that belongs to the operation. | Boundary. | — | V3 bypass test. |
| WS-32 | A subscription or stream is bound to the connection; disconnect cancels it. | Binding. | Cleanup timing. | V3 test. |

---


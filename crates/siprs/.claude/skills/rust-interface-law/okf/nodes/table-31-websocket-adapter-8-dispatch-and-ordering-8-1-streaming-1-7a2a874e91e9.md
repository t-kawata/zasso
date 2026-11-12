---
type: Table
id: table/31-websocket-adapter-8-dispatch-and-ordering-8-1-streaming/1/7a2a874e91e9
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 7a2a874e91e921b5accd9ce36cce84cb20b11f944b1f32100fcc6632fa950f2a
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-23 | `StreamOpen` creates a stream; the server sends `StreamItem` messages followed by exactly one `StreamEnd`. | Lifecycle. | Item encoding. | V3 test. |
| WS-24 | A client stream sends `StreamItem` messages and then `StreamClose`; the server replies with `Response` or `Error`. | Lifecycle. | Item encoding. | V3 test. |
| WS-25 | `StreamCancel` is idempotent, propagates to the operation, and ends with `StreamEnd::Cancelled`. | Cancellation. | Timing. | V3 test. |
| WS-26 | A bidi stream has independent half-close for input and output. | Half-close. | Encoding. | V3 test. |
| WS-27 | Backpressure applies to stream items; an overflow closes with 1013. | Bound. | Threshold. | V3 load test. |
| WS-28 | `stream_id` is unique per connection and is released on `StreamEnd`. | Uniqueness. | Format. | V3 test. |
| WS-29 | The adapter calls the dispatcher's stream methods; it does not implement business streaming. | Call path. | — | V3 bypass test. |

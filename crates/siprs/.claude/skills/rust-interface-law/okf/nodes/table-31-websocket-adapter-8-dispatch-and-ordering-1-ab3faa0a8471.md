---
type: Table
id: table/31-websocket-adapter-8-dispatch-and-ordering/1/ab3faa0a8471
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: ab3faa0a84716095251cd3eb9e73bd7e1f30378839a1d097dcb331703424d970
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-10 | Each request carries a `request_id`; the response carries the same ID. | Correlation. | ID generation. | V3 test. |
| WS-11 | Concurrent requests may interleave. | Allowed. | Concurrency limit. | V3 test. |
| WS-12 | Mutations to the same resource preserve a defined order. | Per-resource FIFO. | Queue implementation. | V3 ordering test. |
| WS-13 | No global ordering is promised. | Non-guarantee documented. | — | V4 review. |
| WS-14 | The adapter calls `Dispatcher::execute_verified`; it does not call handlers directly. | Call path. | — | V3 bypass test. |

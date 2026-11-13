---
type: Table
id: table/31-websocket-adapter-11-implementation-contract-11-5-rules/1/06c54f2db70f
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 06c54f2db70fc6a25c320c99558a5040efb12f42a1f106d02e909d2686de5ff9
source: sources/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-33 | Origin validation and ticket redemption MUST complete before WebSocket acceptance. | Pre-accept. | Header name. | V3 pre-accept probe. |
| WS-34 | All connection queues and dispatch concurrency MUST be bounded, with overload producing the configured 1013 close path. | Bounds. | Capacity values. | V3 overload test. |
| WS-35 | Stream input closure, output termination, and cancellation MUST be distinct states with deterministic cleanup. | State model. | Timing. | V3 lifecycle test. |

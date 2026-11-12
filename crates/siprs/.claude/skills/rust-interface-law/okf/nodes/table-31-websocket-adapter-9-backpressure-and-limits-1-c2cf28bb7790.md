---
type: Table
id: table/31-websocket-adapter-9-backpressure-and-limits/1/c2cf28bb7790
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: c2cf28bb77905b9d7ba012fa5203b1488219cf58851510e0398ea0621ee1179b
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-15 | Message size, frame size, queue length, and connection count are bounded. | Bounds exist. | Values. | V3 load test. |
| WS-16 | Control queue overflow and audio queue overflow have distinct policies. | Distinct behavior. | Thresholds. | V3 test. |
| WS-17 | A slow reader MUST NOT block the runtime; the connection is closed with 1013. | Close behavior. | Threshold. | V3 test. |
| WS-18 | Ping/pong intervals and timeouts are configured. | Presence. | Values. | V3 test. |

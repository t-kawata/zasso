---
type: "Section"
title: "9. Backpressure and Limits"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-9-backpressure-and-limits"
    title: "9. Backpressure and Limits"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "269-279"
---
## 9. Backpressure and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-15 | Message size, frame size, queue length, and connection count are bounded. | Bounds exist. | Values. | V3 load test. |
| WS-16 | Control queue overflow and audio queue overflow have distinct policies. | Distinct behavior. | Thresholds. | V3 test. |
| WS-17 | A slow reader MUST NOT block the runtime; the connection is closed with 1013. | Close behavior. | Threshold. | V3 test. |
| WS-18 | Ping/pong intervals and timeouts are configured. | Presence. | Values. | V3 test. |

---


---
type: "Section"
title: "9. Backpressure and Limits"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/9-backpressure-and-limits"
    title: "9. Backpressure and Limits"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/9-backpressure-and-limits"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4397-4397"
---
## 9. Backpressure and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-15 | Message size, frame size, queue length, and connection count are bounded. | Bounds exist. | Values. | V3 load test. |
| WS-16 | Control queue overflow and audio queue overflow have distinct policies. | Distinct behavior. | Thresholds. | V3 test. |
| WS-17 | A slow reader MUST NOT block the runtime; the connection is closed with 1013. | Close behavior. | Threshold. | V3 test. |
| WS-18 | Ping/pong intervals and timeouts are configured. | Presence. | Values. | V3 test. |

---

## 10. Close Codes and Cleanup

## Rules in this section

- [WS-15 — Message size, frame size, queue length, and connection count are bounded.](../../rules/c/ws-15.md)
- [WS-16 — Control queue overflow and audio queue overflow have distinct policies.](../../rules/c/ws-16.md)
- [WS-17 — A slow reader MUST NOT block the runtime; the connection is closed with 1013.](../../rules/c/ws-17.md)
- [WS-18 — Ping/pong intervals and timeouts are configured.](../../rules/c/ws-18.md)


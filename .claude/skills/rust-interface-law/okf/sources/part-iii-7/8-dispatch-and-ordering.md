---
type: "Section"
title: "8. Dispatch and Ordering"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/8-dispatch-and-ordering"
    title: "8. Dispatch and Ordering"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/8-dispatch-and-ordering"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4363-4363"
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

## Rules in this section

- [WS-10 — Each request carries a `request_id`; the response carries the same ID.](../../rules/c/ws-10.md)
- [WS-11 — Concurrent requests may interleave.](../../rules/c/ws-11.md)
- [WS-12 — Mutations to the same resource preserve a defined order.](../../rules/c/ws-12.md)
- [WS-13 — No global ordering is promised.](../../rules/c/ws-13.md)
- [WS-14 — The adapter calls `Dispatcher::execute_verified`; it does not call handlers d...](../../rules/c/ws-14.md)


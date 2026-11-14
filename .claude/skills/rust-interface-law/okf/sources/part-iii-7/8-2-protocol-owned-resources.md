---
type: "Section"
title: "8.2 Protocol-owned resources"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/8-2-protocol-owned-resources"
    title: "8.2 Protocol-owned resources"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/8-2-protocol-owned-resources"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4387-4387"
---
### 8.2 Protocol-owned resources

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-30 | The adapter authorizes protocol-owned subscriptions and streams against the connection identity. | Adapter auth. | Policy. | V3 test. |
| WS-31 | The adapter MUST NOT authorize business resources; that belongs to the operation. | Boundary. | — | V3 bypass test. |
| WS-32 | A subscription or stream is bound to the connection; disconnect cancels it. | Binding. | Cleanup timing. | V3 test. |

---

## 9. Backpressure and Limits

## Rules in this section

- [WS-30 — The adapter authorizes protocol-owned subscriptions and streams against the c...](../../rules/c/ws-30.md)
- [WS-31 — The adapter MUST NOT authorize business resources; that belongs to the operat...](../../rules/c/ws-31.md)
- [WS-32 — A subscription or stream is bound to the connection; disconnect cancels it.](../../rules/c/ws-32.md)


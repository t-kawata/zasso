---
type: "Section"
title: "10. Close Codes and Cleanup"
description: "| Code | Meaning |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/10-close-codes-and-cleanup"
    title: "10. Close Codes and Cleanup"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/10-close-codes-and-cleanup"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4408-4408"
---
## 10. Close Codes and Cleanup

| Code | Meaning |
|---|---|
| 1000 | Normal closure |
| 1008 | Policy violation (authentication, authorization, origin) |
| 1009 | Message too large |
| 1011 | Internal error |
| 1013 | Try again later (backpressure) |

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-19 | Close codes use the table above. | Table. | Reason text. | V3 test. |
| WS-20 | Disconnect cleans up connection-owned subscriptions, streams, and temporary resources. | Cleanup required. | Implementation. | V3 leak test. |
| WS-21 | In-flight operations may complete after disconnect; their results are discarded unless the operation is explicitly cancel-on-disconnect. | Policy explicit. | Per-operation policy. | V3 test. |
| WS-22 | Origin allowlisting is applied before authentication. | Order. | Allowed list. | V3 test. |

---

## 11. Fixed and Open

## Rules in this section

- [WS-19 — Close codes use the table above.](../../rules/c/ws-19.md)
- [WS-20 — Disconnect cleans up connection-owned subscriptions, streams, and temporary r...](../../rules/c/ws-20.md)
- [WS-21 — In-flight operations may complete after disconnect; their results are discard...](../../rules/c/ws-21.md)
- [WS-22 — Origin allowlisting is applied before authentication.](../../rules/c/ws-22.md)


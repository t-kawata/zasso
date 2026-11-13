---
type: "Section"
title: "10. Close Codes and Cleanup"
description: "| Code | Meaning |"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-10-close-codes-and-cleanup"
    title: "10. Close Codes and Cleanup"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "280-298"
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


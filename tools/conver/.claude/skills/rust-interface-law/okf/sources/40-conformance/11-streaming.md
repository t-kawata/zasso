---
type: "Section"
title: "11. Streaming"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-11-streaming"
    title: "11. Streaming"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "203-214"
---
## 11. Streaming

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-30 | Server stream items, EOF, error, and cancel match the operation contract. | Semantics. | Encoding. | V3 test. |
| CONF-31 | Client stream input, EOF, and cancel match the contract. | Semantics. | Encoding. | V3 test. |
| CONF-32 | Bidi streams preserve independent half-close and cancellation. | Semantics. | Encoding. | V3 test. |
| CONF-33 | Backpressure is observable and bounded. | Bound. | Threshold. | V3 load test. |
| CONF-34 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | Result authorization. | Store backend. | V3 test. |

---


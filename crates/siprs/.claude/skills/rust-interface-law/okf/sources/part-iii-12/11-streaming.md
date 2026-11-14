---
type: "Section"
title: "11. Streaming"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/11-streaming"
    title: "11. Streaming"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/11-streaming"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5533-5533"
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

## 12. Drivers

## Rules in this section

- [CONF-30 — Server stream items, EOF, error, and cancel match the operation contract.](../../rules/p/conf-30.md)
- [CONF-31 — Client stream input, EOF, and cancel match the contract.](../../rules/p/conf-31.md)
- [CONF-32 — Bidi streams preserve independent half-close and cancellation.](../../rules/p/conf-32.md)
- [CONF-33 — Backpressure is observable and bounded.](../../rules/p/conf-33.md)
- [CONF-34 — A cancelled operation's result is queryable through the authorized result loo...](../../rules/p/conf-34.md)


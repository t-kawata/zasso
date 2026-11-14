---
type: "Section"
title: "7. Independent Oracle"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/7-independent-oracle"
    title: "7. Independent Oracle"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/7-independent-oracle"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5485-5485"
---
## 7. Independent Oracle

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-10 | Expected results are derived from the operation specification, not from one interface. | Independent oracle. | Oracle implementation. | V3 review of oracle source. |
| CONF-11 | All interfaces answering the same wrong result is a failure. | Independent expectation. | — | V3 test. |
| CONF-12 | The oracle covers normal, failure, state, authorization, idempotency, and streaming. | Coverage. | Case content. | V3 test. |

---

## 8. Authentication and Binding

## Rules in this section

- [CONF-10 — Expected results are derived from the operation specification, not from one i...](../../rules/p/conf-10.md)
- [CONF-11 — All interfaces answering the same wrong result is a failure.](../../rules/p/conf-11.md)
- [CONF-12 — The oracle covers normal, failure, state, authorization, idempotency, and str...](../../rules/p/conf-12.md)


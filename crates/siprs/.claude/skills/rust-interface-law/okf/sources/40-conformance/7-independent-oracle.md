---
type: "Section"
title: "7. Independent Oracle"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-7-independent-oracle"
    title: "7. Independent Oracle"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "155-164"
---
## 7. Independent Oracle

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-10 | Expected results are derived from the operation specification, not from one interface. | Independent oracle. | Oracle implementation. | V3 review of oracle source. |
| CONF-11 | All interfaces answering the same wrong result is a failure. | Independent expectation. | — | V3 test. |
| CONF-12 | The oracle covers normal, failure, state, authorization, idempotency, and streaming. | Coverage. | Case content. | V3 test. |

---


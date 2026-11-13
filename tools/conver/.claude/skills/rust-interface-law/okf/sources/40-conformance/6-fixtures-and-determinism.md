---
type: "Section"
title: "6. Fixtures and Determinism"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-6-fixtures-and-determinism"
    title: "6. Fixtures and Determinism"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "143-154"
---
## 6. Fixtures and Determinism

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-05 | Every case names a fixture with setup and reset. | Fixture boundary. | Fixture content. | V3 test. |
| CONF-06 | IDs and time are deterministic in fixtures. | Determinism. | Clock/id strategy. | V3 test. |
| CONF-07 | Generated IDs and timestamps use semantic matchers, not exact equality. | Matcher rule. | Matcher choice. | V3 test. |
| CONF-08 | A case must not depend on the order of another case. | Isolation. | — | V3 test. |
| CONF-09 | A mutation case must assert the resulting state, not only the response. | State oracle. | State shape. | V3 test. |

---


---
type: "Section"
title: "13. Dependency and Rule Coverage"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-13-dependency-and-rule-coverage"
    title: "13. Dependency and Rule Coverage"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "242-253"
---
## 13. Dependency and Rule Coverage

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-37 | The crate graph passes the forbidden-edge checks. | Edge rules. | — | V2 `cargo metadata`. |
| CONF-38 | Every rule ID in the registry has a verdict. | Coverage. | — | V3 rule-coverage test. |
| CONF-39 | A missing verification is a failure, not a skip. | Fail-closed. | — | V3 test. |
| CONF-40 | Documentation, file existence, and fixture names are not proof. | Forbidden. | — | V3 report inspection; V4 review. |
| CONF-41 | The report names every failed row and every rule without evidence. | Report shape. | Presentation. | V3 test. |

---


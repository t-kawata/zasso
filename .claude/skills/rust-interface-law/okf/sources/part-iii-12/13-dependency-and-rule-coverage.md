---
type: "Section"
title: "13. Dependency and Rule Coverage"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/13-dependency-and-rule-coverage"
    title: "13. Dependency and Rule Coverage"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/13-dependency-and-rule-coverage"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5572-5572"
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

## 14. SSO Regression

## Rules in this section

- [CONF-37 — The crate graph passes the forbidden-edge checks.](../../rules/p/conf-37.md)
- [CONF-38 — Every rule ID in the registry has a verdict.](../../rules/p/conf-38.md)
- [CONF-39 — A missing verification is a failure, not a skip.](../../rules/p/conf-39.md)
- [CONF-40 — Documentation, file existence, and fixture names are not proof.](../../rules/p/conf-40.md)
- [CONF-41 — The report names every failed row and every rule without evidence.](../../rules/p/conf-41.md)


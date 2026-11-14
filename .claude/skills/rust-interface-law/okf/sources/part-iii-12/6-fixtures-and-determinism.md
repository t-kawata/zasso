---
type: "Section"
title: "6. Fixtures and Determinism"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/6-fixtures-and-determinism"
    title: "6. Fixtures and Determinism"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/6-fixtures-and-determinism"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5473-5473"
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

## 7. Independent Oracle

## Rules in this section

- [CONF-05 — Every case names a fixture with setup and reset.](../../rules/p/conf-05.md)
- [CONF-06 — IDs and time are deterministic in fixtures.](../../rules/p/conf-06.md)
- [CONF-07 — Generated IDs and timestamps use semantic matchers, not exact equality.](../../rules/p/conf-07.md)
- [CONF-08 — A case must not depend on the order of another case.](../../rules/p/conf-08.md)
- [CONF-09 — A mutation case must assert the resulting state, not only the response.](../../rules/p/conf-09.md)


---
type: "Section"
title: "12.3 Application rules"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/12-3-application-rules"
    title: "12.3 Application rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/12-3-application-rules"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "952-952"
---
### 12.3 Application rules

| ID | Rule | Verification |
|---|---|---|
| APP-01 | A project MUST declare its profiles and MUST list every unimplemented interface as absent. | V2 profile check. |
| APP-02 | A project MUST maintain an operation catalog using the §11 template. | V3 catalog test. |
| APP-03 | A project MUST map its crates to §3.1 roles and record the mapping. | V4 review; V2 manifest check. |
| APP-04 | Exceptions MUST be declared with a reason, scope, owner, and expiry. Undeclared exceptions are defects. | V2 exception check. |
| APP-05 | This document is versioned. A project pins the version it applies. | V2 lock/check. |
| APP-06 | Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset. | V4 review; project plan. |
| APP-07 | Each adopted rule MUST first have a failing conformance test, then an implementation, then a refactor. | V3 test history; V4 review. |

---

## 13. Rule Index

## Rules in this section

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../../rules/o/app-01.md)
- [APP-02 — A project MUST maintain an operation catalog using the §11 template.](../../rules/o/app-02.md)
- [APP-03 — A project MUST map its crates to §3.1 roles and record the mapping.](../../rules/o/app-03.md)
- [APP-04 — Exceptions MUST be declared with a reason, scope, owner, and expiry. Undeclar...](../../rules/o/app-04.md)
- [APP-05 — This document is versioned. A project pins the version it applies.](../../rules/o/app-05.md)
- [APP-06 — Adoption order SHOULD, within the interface profiles a project selects, be: i...](../../rules/o/app-06.md)
- [APP-07 — Each adopted rule MUST first have a failing conformance test, then an impleme...](../../rules/o/app-07.md)


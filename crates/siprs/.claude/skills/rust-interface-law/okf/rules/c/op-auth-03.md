---
type: "Rule"
title: "OP-AUTH-03 — Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`."
description: "Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-auth-03"
    title: "OP-AUTH-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-AUTH-03"
x-source-part: "Part III.4"
x-source-span: "265-265"
x-verification: "V3 test."
---
# OP-AUTH-03

Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-AUTH |
| Source part | Part III.4 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^op-auth-03]: sources/21-OPERATION.md


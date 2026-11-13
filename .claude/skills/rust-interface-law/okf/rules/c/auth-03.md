---
type: "Rule"
title: "AUTH-03 — Access tokens MUST be JWS. JWE is not used."
description: "Access tokens MUST be JWS. JWE is not used."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "auth-03"
    title: "AUTH-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTH-03"
x-source-part: "Part II"
x-source-span: "265-265"
x-verification: "V3 token test."
---
# AUTH-03

Access tokens MUST be JWS. JWE is not used.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 token test. |
| Enforcement | negative-auth suite |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^auth-03]: sources/21-OPERATION.md


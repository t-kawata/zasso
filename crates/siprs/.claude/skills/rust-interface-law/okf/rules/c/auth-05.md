---
type: "Rule"
title: "AUTH-05 — The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches."
description: "The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "auth-05"
    title: "AUTH-05"
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
x-rule-id: "AUTH-05"
x-source-part: "Part II"
x-source-span: "267-267"
x-verification: "V3 negative tests N-1, N-2, N-3."
---
# AUTH-05

The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 negative tests N-1, N-2, N-3. |
| Enforcement | negative-auth suite |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^auth-05]: sources/21-OPERATION.md


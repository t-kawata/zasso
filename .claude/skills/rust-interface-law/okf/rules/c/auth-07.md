---
type: "Rule"
title: "AUTH-07 — `sub` MUST be the internal `SubjectId`."
description: "`sub` MUST be the internal `SubjectId`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-07"
    title: "AUTH-07"
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
x-rule-id: "AUTH-07"
x-source-part: "Part II"
x-source-span: "65-65"
x-verification: "V3 token test."
---
# AUTH-07

`sub` MUST be the internal `SubjectId`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 token test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-07]: sources/15-RULE-REGISTRY.md


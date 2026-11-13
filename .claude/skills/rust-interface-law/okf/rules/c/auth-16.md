---
type: "Rule"
title: "AUTH-16 — Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned."
description: "Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-16"
    title: "AUTH-16"
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
x-rule-id: "AUTH-16"
x-source-part: "Part II"
x-source-span: "74-74"
x-verification: "V3 response test."
---
# AUTH-16

Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 response test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-16]: sources/15-RULE-REGISTRY.md


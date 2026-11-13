---
type: "Rule"
title: "AUTH-09 — Access-token lifetime MUST be short and configurable (recommended 5–15 minutes)."
description: "Access-token lifetime MUST be short and configurable (recommended 5–15 minutes)."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-09"
    title: "AUTH-09"
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
x-rule-id: "AUTH-09"
x-source-part: "Part II"
x-source-span: "67-67"
x-verification: "V2 config check."
---
# AUTH-09

Access-token lifetime MUST be short and configurable (recommended 5–15 minutes).

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V2 config check. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-09]: sources/15-RULE-REGISTRY.md


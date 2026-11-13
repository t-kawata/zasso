---
type: "Rule"
title: "AUTH-21 — REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401."
description: "REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-21"
    title: "AUTH-21"
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
x-rule-id: "AUTH-21"
x-source-part: "Part II"
x-source-span: "79-79"
x-verification: "V3 test."
---
# AUTH-21

REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-21]: sources/15-RULE-REGISTRY.md


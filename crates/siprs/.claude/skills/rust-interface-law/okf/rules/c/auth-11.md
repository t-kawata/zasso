---
type: "Rule"
title: "AUTH-11 — Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration."
description: "Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-11"
    title: "AUTH-11"
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
x-rule-id: "AUTH-11"
x-source-part: "Part II"
x-source-span: "69-69"
x-verification: "V3 negative test N-11."
---
# AUTH-11

Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 negative test N-11. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-11]: sources/15-RULE-REGISTRY.md


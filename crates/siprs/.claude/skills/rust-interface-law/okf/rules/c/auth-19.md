---
type: "Rule"
title: "AUTH-19 — Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`."
description: "Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-19"
    title: "AUTH-19"
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
x-rule-id: "AUTH-19"
x-source-part: "Part II"
x-source-span: "77-77"
x-verification: "V3 test."
---
# AUTH-19

Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-19]: sources/15-RULE-REGISTRY.md


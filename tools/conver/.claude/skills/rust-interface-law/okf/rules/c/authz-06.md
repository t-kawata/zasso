---
type: "Rule"
title: "AUTHZ-06 — Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation."
description: "Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-06"
    title: "AUTHZ-06"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTHZ"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTHZ-06"
x-source-part: "Part II"
x-source-span: "95-95"
x-verification: "V2 string scan; V4 review."
---
# AUTHZ-06

Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V2 string scan; V4 review. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-06]: sources/15-RULE-REGISTRY.md


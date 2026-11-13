---
type: "Rule"
title: "AUTHZ-04 — Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express \"maybe anonymous\"."
description: "Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express \"maybe anonymous\"."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-04"
    title: "AUTHZ-04"
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
x-rule-id: "AUTHZ-04"
x-source-part: "Part II"
x-source-span: "93-93"
x-verification: "V1 type; V3 test."
---
# AUTHZ-04

Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express "maybe anonymous".

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V1 type; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-04]: sources/15-RULE-REGISTRY.md


---
type: "Rule"
title: "AUTHZ-07 — Authorization and mutation races MUST be handled with a transaction or a conditional update."
description: "Authorization and mutation races MUST be handled with a transaction or a conditional update."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-07"
    title: "AUTHZ-07"
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
x-rule-id: "AUTHZ-07"
x-source-part: "Part II"
x-source-span: "96-96"
x-verification: "V3 race test."
---
# AUTHZ-07

Authorization and mutation races MUST be handled with a transaction or a conditional update.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 race test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-07]: sources/15-RULE-REGISTRY.md


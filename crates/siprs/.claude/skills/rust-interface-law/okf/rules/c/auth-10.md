---
type: "Rule"
title: "AUTH-10 — Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation."
description: "Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-10"
    title: "AUTH-10"
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
x-rule-id: "AUTH-10"
x-source-part: "Part II"
x-source-span: "68-68"
x-verification: "V1 trait; V3 rotation test."
---
# AUTH-10

Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V1 trait; V3 rotation test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-10]: sources/15-RULE-REGISTRY.md


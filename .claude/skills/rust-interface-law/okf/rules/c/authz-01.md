---
type: "Rule"
title: "AUTHZ-01 — Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`."
description: "Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-01"
    title: "AUTHZ-01"
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
x-rule-id: "AUTHZ-01"
x-source-part: "Part II"
x-source-span: "90-90"
x-verification: "V1 trait; V4 review."
---
# AUTHZ-01

Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V1 trait; V4 review. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-01]: sources/15-RULE-REGISTRY.md


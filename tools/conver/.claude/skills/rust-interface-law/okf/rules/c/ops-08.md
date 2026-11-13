---
type: "Rule"
title: "OPS-08 — Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone."
description: "Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-08"
    title: "OPS-08"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OPS"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OPS-08"
x-source-part: "Part II"
x-source-span: "350-350"
x-verification: "V3 cross-tenant test."
---
# OPS-08

Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 cross-tenant test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-08]: sources/15-RULE-REGISTRY.md


---
type: "Rule"
title: "AUTHZ-03 — Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs."
description: "Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-03"
    title: "AUTHZ-03"
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
x-rule-id: "AUTHZ-03"
x-source-part: "Part II"
x-source-span: "92-92"
x-verification: "V3 cross-tenant test."
---
# AUTHZ-03

Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 cross-tenant test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-03]: sources/15-RULE-REGISTRY.md


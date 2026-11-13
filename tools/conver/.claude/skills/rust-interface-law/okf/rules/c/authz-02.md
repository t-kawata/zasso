---
type: "Rule"
title: "AUTHZ-02 — Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked."
description: "Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-02"
    title: "AUTHZ-02"
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
x-rule-id: "AUTHZ-02"
x-source-part: "Part II"
x-source-span: "91-91"
x-verification: "V3 test."
---
# AUTHZ-02

Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-02]: sources/15-RULE-REGISTRY.md


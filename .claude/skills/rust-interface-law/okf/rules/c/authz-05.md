---
type: "Rule"
title: "AUTHZ-05 — A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied."
description: "A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-05"
    title: "AUTHZ-05"
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
x-rule-id: "AUTHZ-05"
x-source-part: "Part II"
x-source-span: "94-94"
x-verification: "V3 test."
---
# AUTHZ-05

A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-05]: sources/15-RULE-REGISTRY.md


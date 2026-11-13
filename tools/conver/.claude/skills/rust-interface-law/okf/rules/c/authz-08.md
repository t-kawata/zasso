---
type: "Rule"
title: "AUTHZ-08 — An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization."
description: "An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-08"
    title: "AUTHZ-08"
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
x-rule-id: "AUTHZ-08"
x-source-part: "Part II"
x-source-span: "97-97"
x-verification: "V3 bypass test."
---
# AUTHZ-08

An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 bypass test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-08]: sources/15-RULE-REGISTRY.md


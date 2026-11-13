---
type: "Rule"
title: "AUTHZ-09 — The same identity, action, and resource MUST produce the same authorization result through every interface."
description: "The same identity, action, and resource MUST produce the same authorization result through every interface."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-09"
    title: "AUTHZ-09"
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
x-rule-id: "AUTHZ-09"
x-source-part: "Part II"
x-source-span: "98-98"
x-verification: "V3 conformance test."
---
# AUTHZ-09

The same identity, action, and resource MUST produce the same authorization result through every interface.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 conformance test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^authz-09]: sources/15-RULE-REGISTRY.md


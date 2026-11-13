---
type: "Rule"
title: "SEC-02 — Authentication endpoints and mutating operations MUST be rate-limited."
description: "Authentication endpoints and mutating operations MUST be rate-limited."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sec-02"
    title: "SEC-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "SEC"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "SEC-02"
x-source-part: "Part II"
x-source-span: "380-380"
x-verification: "V3 load test."
---
# SEC-02

Authentication endpoints and mutating operations MUST be rate-limited.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | SEC |
| Source part | Part II |
| Verification | V3 load test. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^sec-02]: sources/15-RULE-REGISTRY.md


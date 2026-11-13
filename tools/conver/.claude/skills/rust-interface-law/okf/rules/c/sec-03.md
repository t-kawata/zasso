---
type: "Rule"
title: "SEC-03 — Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them."
description: "Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sec-03"
    title: "SEC-03"
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
x-rule-id: "SEC-03"
x-source-part: "Part II"
x-source-span: "381-381"
x-verification: "V2 secret scan."
---
# SEC-03

Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | SEC |
| Source part | Part II |
| Verification | V2 secret scan. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^sec-03]: sources/15-RULE-REGISTRY.md


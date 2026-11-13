---
type: "Rule"
title: "ERR-01 — Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details."
description: "Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "err-01"
    title: "ERR-01"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "ERR"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ERR-01"
x-source-part: "Part II"
x-source-span: "225-225"
x-verification: "V1 type."
---
# ERR-01

Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ERR |
| Source part | Part II |
| Verification | V1 type. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^err-01]: sources/15-RULE-REGISTRY.md


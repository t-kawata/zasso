---
type: "Rule"
title: "OPS-01 — Every operation MUST have a stable `operation_id` and a typed request/response pair."
description: "Every operation MUST have a stable `operation_id` and a typed request/response pair."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-01"
    title: "OPS-01"
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
x-rule-id: "OPS-01"
x-source-part: "Part II"
x-source-span: "343-343"
x-verification: "V1 types; V3 catalog test."
---
# OPS-01

Every operation MUST have a stable `operation_id` and a typed request/response pair.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V1 types; V3 catalog test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-01]: sources/15-RULE-REGISTRY.md


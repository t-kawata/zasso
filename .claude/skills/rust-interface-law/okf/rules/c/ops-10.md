---
type: "Rule"
title: "OPS-10 — Mutations that touch multiple resources MUST use a transaction or a compensating action."
description: "Mutations that touch multiple resources MUST use a transaction or a compensating action."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-10"
    title: "OPS-10"
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
x-rule-id: "OPS-10"
x-source-part: "Part II"
x-source-span: "352-352"
x-verification: "V3 failure-injection test."
---
# OPS-10

Mutations that touch multiple resources MUST use a transaction or a compensating action.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 failure-injection test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-10]: sources/15-RULE-REGISTRY.md


---
type: "Rule"
title: "OPS-18 — The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic."
description: "The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-18"
    title: "OPS-18"
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
x-rule-class: "G"
x-rule-id: "OPS-18"
x-source-part: "Part II"
x-source-span: "360-360"
x-verification: "V3 test."
---
# OPS-18

The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-18]: sources/15-RULE-REGISTRY.md


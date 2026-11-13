---
type: "Rule"
title: "OPS-03 — `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease."
description: "`context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-03"
    title: "OPS-03"
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
x-rule-id: "OPS-03"
x-source-part: "Part II"
x-source-span: "345-345"
x-verification: "V1 type; V3 rejection test."
---
# OPS-03

`context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V1 type; V3 rejection test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-03]: sources/15-RULE-REGISTRY.md


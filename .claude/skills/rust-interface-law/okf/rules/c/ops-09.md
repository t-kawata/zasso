---
type: "Rule"
title: "OPS-09 — Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict."
description: "Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-09"
    title: "OPS-09"
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
x-rule-id: "OPS-09"
x-source-part: "Part II"
x-source-span: "351-351"
x-verification: "V3 test."
---
# OPS-09

Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-09]: sources/15-RULE-REGISTRY.md


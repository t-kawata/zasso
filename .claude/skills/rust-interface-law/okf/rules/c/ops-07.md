---
type: "Rule"
title: "OPS-07 — Authorization MUST run inside the operation, not only in the adapter."
description: "Authorization MUST run inside the operation, not only in the adapter."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-07"
    title: "OPS-07"
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
x-rule-id: "OPS-07"
x-source-part: "Part II"
x-source-span: "349-349"
x-verification: "V3 bypass test."
---
# OPS-07

Authorization MUST run inside the operation, not only in the adapter.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 bypass test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-07]: sources/15-RULE-REGISTRY.md


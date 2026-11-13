---
type: "Rule"
title: "OPS-15 — Every operation MUST publish domain events only after commit."
description: "Every operation MUST publish domain events only after commit."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-15"
    title: "OPS-15"
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
x-rule-id: "OPS-15"
x-source-part: "Part II"
x-source-span: "357-357"
x-verification: "V3 test."
---
# OPS-15

Every operation MUST publish domain events only after commit.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-15]: sources/15-RULE-REGISTRY.md


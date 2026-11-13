---
type: "Rule"
title: "VAL-12 — The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch."
description: "The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-12"
    title: "VAL-12"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test + docgen --check validation"
x-parent: "VAL"
x-phase: "docs"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "G"
x-rule-id: "VAL-12"
x-source-part: "Part III.17"
x-source-span: "224-224"
x-verification: "V3 test."
---
# VAL-12

The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 test. |
| Enforcement | cargo test + docgen --check validation |

[6. Runtime Execution](../../sources/47-validation/6-runtime-execution.md)

[^val-12]: sources/47-VALIDATION.md


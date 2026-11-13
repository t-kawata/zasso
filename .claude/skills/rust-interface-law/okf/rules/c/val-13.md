---
type: "Rule"
title: "VAL-13 — Validation failures map to `invalid_input` with field, code, and English message."
description: "Validation failures map to `invalid_input` with field, code, and English message."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-13"
    title: "VAL-13"
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
x-rule-class: "C"
x-rule-id: "VAL-13"
x-source-part: "Part III.17"
x-source-span: "225-225"
x-verification: "V3 test."
---
# VAL-13

Validation failures map to `invalid_input` with field, code, and English message.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 test. |
| Enforcement | cargo test + docgen --check validation |

[6. Runtime Execution](../../sources/47-validation/6-runtime-execution.md)

[^val-13]: sources/47-VALIDATION.md


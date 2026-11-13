---
type: "Rule"
title: "VAL-09 — A custom rule without a description fails compilation."
description: "A custom rule without a description fails compilation."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-09"
    title: "VAL-09"
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
x-rule-id: "VAL-09"
x-source-part: "Part III.17"
x-source-span: "194-194"
x-verification: "V3 compile-fail test."
---
# VAL-09

A custom rule without a description fails compilation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 compile-fail test. |
| Enforcement | cargo test + docgen --check validation |

[5. Custom Rules](../../sources/47-validation/5-custom-rules.md)

[^val-09]: sources/47-VALIDATION.md


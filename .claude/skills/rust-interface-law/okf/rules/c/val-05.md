---
type: "Rule"
title: "VAL-05 — Unknown rules and rules applied to an incompatible type MUST be compile-time errors."
description: "Unknown rules and rules applied to an incompatible type MUST be compile-time errors."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-05"
    title: "VAL-05"
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
x-rule-id: "VAL-05"
x-source-part: "Part III.17"
x-source-span: "158-158"
x-verification: "V3 compile-fail test."
---
# VAL-05

Unknown rules and rules applied to an incompatible type MUST be compile-time errors.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 compile-fail test. |
| Enforcement | cargo test + docgen --check validation |

[4. Standard Rule Conversion](../../sources/47-validation/4-standard-rule-conversion.md)

[^val-05]: sources/47-VALIDATION.md


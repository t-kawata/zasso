---
type: "Rule"
title: "VAL-15 — Every field rule appears in every applicable interface's documentation."
description: "Every field rule appears in every applicable interface's documentation."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-15"
    title: "VAL-15"
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
x-rule-id: "VAL-15"
x-source-part: "Part III.17"
x-source-span: "249-249"
x-verification: "V3 completeness test."
---
# VAL-15

Every field rule appears in every applicable interface's documentation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 completeness test. |
| Enforcement | cargo test + docgen --check validation |

[7. Documentation](../../sources/47-validation/7-documentation.md)

[^val-15]: sources/47-VALIDATION.md


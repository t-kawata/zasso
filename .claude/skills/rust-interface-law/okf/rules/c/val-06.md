---
type: "Rule"
title: "VAL-06 — Every standard and custom rule carries an `error_code`."
description: "Every standard and custom rule carries an `error_code`."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-06"
    title: "VAL-06"
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
x-rule-id: "VAL-06"
x-source-part: "Part III.17"
x-source-span: "159-159"
x-verification: "V1/V3."
---
# VAL-06

Every standard and custom rule carries an `error_code`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V1/V3. |
| Enforcement | cargo test + docgen --check validation |

[4. Standard Rule Conversion](../../sources/47-validation/4-standard-rule-conversion.md)

[^val-06]: sources/47-VALIDATION.md


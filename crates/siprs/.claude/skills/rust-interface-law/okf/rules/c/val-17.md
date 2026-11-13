---
type: "Rule"
title: "VAL-17 — Custom rules appear as readable English text in every interface reference, not only in an extension field."
description: "Custom rules appear as readable English text in every interface reference, not only in an extension field."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-17"
    title: "VAL-17"
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
x-rule-id: "VAL-17"
x-source-part: "Part III.17"
x-source-span: "251-251"
x-verification: "V3 test."
---
# VAL-17

Custom rules appear as readable English text in every interface reference, not only in an extension field.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 test. |
| Enforcement | cargo test + docgen --check validation |

[7. Documentation](../../sources/47-validation/7-documentation.md)

[^val-17]: sources/47-VALIDATION.md


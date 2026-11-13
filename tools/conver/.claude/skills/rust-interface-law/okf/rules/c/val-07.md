---
type: "Rule"
title: "VAL-07 — Custom rules require `id`, `check`, `fields`, `description`, and `code`."
description: "Custom rules require `id`, `check`, `fields`, `description`, and `code`."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-07"
    title: "VAL-07"
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
x-rule-id: "VAL-07"
x-source-part: "Part III.17"
x-source-span: "192-192"
x-verification: "V1 macro check; V3 test."
---
# VAL-07

Custom rules require `id`, `check`, `fields`, `description`, and `code`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V1 macro check; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[5. Custom Rules](../../sources/47-validation/5-custom-rules.md)

[^val-07]: sources/47-VALIDATION.md


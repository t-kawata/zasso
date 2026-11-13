---
type: "Rule"
title: "VAL-10 — The runtime and the descriptor use the same `check` function and `code`."
description: "The runtime and the descriptor use the same `check` function and `code`."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-10"
    title: "VAL-10"
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
x-rule-id: "VAL-10"
x-source-part: "Part III.17"
x-source-span: "195-195"
x-verification: "V3 test."
---
# VAL-10

The runtime and the descriptor use the same `check` function and `code`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 test. |
| Enforcement | cargo test + docgen --check validation |

[5. Custom Rules](../../sources/47-validation/5-custom-rules.md)

[^val-10]: sources/47-VALIDATION.md


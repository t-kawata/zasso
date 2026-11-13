---
type: "Rule"
title: "VAL-19 — Validation descriptors and generated documentation contain no secrets or sensitive examples."
description: "Validation descriptors and generated documentation contain no secrets or sensitive examples."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-19"
    title: "VAL-19"
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
x-rule-id: "VAL-19"
x-source-part: "Part III.17"
x-source-span: "253-253"
x-verification: "V2 scan; V3 test."
---
# VAL-19

Validation descriptors and generated documentation contain no secrets or sensitive examples.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[7. Documentation](../../sources/47-validation/7-documentation.md)

[^val-19]: sources/47-VALIDATION.md


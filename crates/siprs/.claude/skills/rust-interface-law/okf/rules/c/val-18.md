---
type: "Rule"
title: "VAL-18 — Validation descriptions, messages, and examples are English-only."
description: "Validation descriptions, messages, and examples are English-only."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-18"
    title: "VAL-18"
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
x-rule-id: "VAL-18"
x-source-part: "Part III.17"
x-source-span: "252-252"
x-verification: "V2 scan; V3 test."
---
# VAL-18

Validation descriptions, messages, and examples are English-only.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[7. Documentation](../../sources/47-validation/7-documentation.md)

[^val-18]: sources/47-VALIDATION.md


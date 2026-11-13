---
type: "Rule"
title: "VAL-16 — Hand-written constraint lists are forbidden; documentation is generated from descriptors."
description: "Hand-written constraint lists are forbidden; documentation is generated from descriptors."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-16"
    title: "VAL-16"
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
x-rule-id: "VAL-16"
x-source-part: "Part III.17"
x-source-span: "250-250"
x-verification: "V2 scan; V3 test."
---
# VAL-16

Hand-written constraint lists are forbidden; documentation is generated from descriptors.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[7. Documentation](../../sources/47-validation/7-documentation.md)

[^val-16]: sources/47-VALIDATION.md


---
type: "Rule"
title: "VAL-20 — Generation is deterministic for the same descriptor set and version."
description: "Generation is deterministic for the same descriptor set and version."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-20"
    title: "VAL-20"
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
x-rule-id: "VAL-20"
x-source-part: "Part III.17"
x-source-span: "254-254"
x-verification: "V3 digest test."
---
# VAL-20

Generation is deterministic for the same descriptor set and version.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 digest test. |
| Enforcement | cargo test + docgen --check validation |

[7. Documentation](../../sources/47-validation/7-documentation.md)

[^val-20]: sources/47-VALIDATION.md


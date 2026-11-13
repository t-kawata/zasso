---
type: "Rule"
title: "VAL-14 — The same input produces the same validation result through every interface."
description: "The same input produces the same validation result through every interface."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-14"
    title: "VAL-14"
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
x-rule-id: "VAL-14"
x-source-part: "Part III.17"
x-source-span: "226-226"
x-verification: "V3 conformance."
---
# VAL-14

The same input produces the same validation result through every interface.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 conformance. |
| Enforcement | cargo test + docgen --check validation |

[6. Runtime Execution](../../sources/47-validation/6-runtime-execution.md)

[^val-14]: sources/47-VALIDATION.md


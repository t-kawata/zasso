---
type: "Rule"
title: "VAL-04 — A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted."
description: "A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-04"
    title: "VAL-04"
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
x-rule-id: "VAL-04"
x-source-part: "Part III.17"
x-source-span: "157-157"
x-verification: "V3 test."
---
# VAL-04

A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 test. |
| Enforcement | cargo test + docgen --check validation |

[4. Standard Rule Conversion](../../sources/47-validation/4-standard-rule-conversion.md)

[^val-04]: sources/47-VALIDATION.md


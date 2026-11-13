---
type: "Rule"
title: "VAL-11 — Adapters do not implement interface-specific input validation."
description: "Adapters do not implement interface-specific input validation."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "val-11"
    title: "VAL-11"
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
x-rule-id: "VAL-11"
x-source-part: "Part III.17"
x-source-span: "223-223"
x-verification: "V2 scan; V3 test."
---
# VAL-11

Adapters do not implement interface-specific input validation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[6. Runtime Execution](../../sources/47-validation/6-runtime-execution.md)

[^val-11]: sources/47-VALIDATION.md


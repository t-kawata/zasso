---
type: "Rule"
title: "VAL-01 — Every request input constraint is declared once in `#[rule(...)]`."
description: "Every request input constraint is declared once in `#[rule(...)]`."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "val-01"
    title: "VAL-01"
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
x-rule-id: "VAL-01"
x-source-part: "Part III.17"
x-source-span: "186-186"
x-verification: "V2 scan; V3 test."
---
# VAL-01

Every request input constraint is declared once in `#[rule(...)]`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[5. Handler Protocol](../../sources/21-operation/5-handler-protocol.md)

[^val-01]: sources/21-OPERATION.md


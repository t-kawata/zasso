---
type: "Rule"
title: "VAL-03 — Standard rules follow the conversion table in §4."
description: "Standard rules follow the conversion table in §4."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "val-03"
    title: "VAL-03"
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
x-rule-id: "VAL-03"
x-source-part: "Part III.17"
x-source-span: "188-188"
x-verification: "V2 schema diff; V3 test."
---
# VAL-03

Standard rules follow the conversion table in §4.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V2 schema diff; V3 test. |
| Enforcement | cargo test + docgen --check validation |

[5. Handler Protocol](../../sources/21-operation/5-handler-protocol.md)

[^val-03]: sources/21-OPERATION.md


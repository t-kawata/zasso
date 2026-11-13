---
type: "Rule"
title: "VAL-02 — The macro generates the runtime validator, schema, and descriptor from the same declaration."
description: "The macro generates the runtime validator, schema, and descriptor from the same declaration."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "val-02"
    title: "VAL-02"
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
x-rule-id: "VAL-02"
x-source-part: "Part III.17"
x-source-span: "187-187"
x-verification: "V3 test."
---
# VAL-02

The macro generates the runtime validator, schema, and descriptor from the same declaration.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | VAL |
| Source part | Part III.17 |
| Verification | V3 test. |
| Enforcement | cargo test + docgen --check validation |

[5. Handler Protocol](../../sources/21-operation/5-handler-protocol.md)

[^val-02]: sources/21-OPERATION.md


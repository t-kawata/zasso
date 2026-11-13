---
type: "Rule"
title: "OP-VAL-02 — Handlers MUST NOT duplicate standard input validation that the macro already generates."
description: "Handlers MUST NOT duplicate standard input validation that the macro already generates."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-val-02"
    title: "OP-VAL-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-VAL"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-VAL-02"
x-source-part: "Part III.4"
x-source-span: "187-187"
x-verification: "V2 scan; V4 review."
---
# OP-VAL-02

Handlers MUST NOT duplicate standard input validation that the macro already generates.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-VAL |
| Source part | Part III.4 |
| Verification | V2 scan; V4 review. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Handler Protocol](../../sources/21-operation/5-handler-protocol.md)

[^op-val-02]: sources/21-OPERATION.md


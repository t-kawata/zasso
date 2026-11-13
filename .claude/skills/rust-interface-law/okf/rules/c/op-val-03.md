---
type: "Rule"
title: "OP-VAL-03 — Validation failures map to `invalid_input` with field, code, and English message."
description: "Validation failures map to `invalid_input` with field, code, and English message."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-val-03"
    title: "OP-VAL-03"
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
x-rule-id: "OP-VAL-03"
x-source-part: "Part III.4"
x-source-span: "188-188"
x-verification: "V3 test."
---
# OP-VAL-03

Validation failures map to `invalid_input` with field, code, and English message.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-VAL |
| Source part | Part III.4 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Handler Protocol](../../sources/21-operation/5-handler-protocol.md)

[^op-val-03]: sources/21-OPERATION.md


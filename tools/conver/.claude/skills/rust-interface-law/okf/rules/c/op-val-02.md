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
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
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

[5.1 Input Validation](../../sources/part-iii-4/5-1-input-validation.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [OP-VAL-01 — Every request type implements the generated `ContractValidate` and is validat...](../g/op-val-01.md)
- [OP-VAL-03 — Validation failures map to `invalid_input` with field, code, and English mess...](op-val-03.md)

[^op-val-02]: sources/EXPERT-REVIEW-PACKAGE.md


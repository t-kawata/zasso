---
type: "Section"
title: "5.1 Input Validation"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/5-1-input-validation"
    title: "5.1 Input Validation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/5-1-input-validation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3307-3307"
---
### 5.1 Input Validation

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-VAL-01 | Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`. | Order. | Macro expansion. | V3 test. |
| OP-VAL-02 | Handlers MUST NOT duplicate standard input validation that the macro already generates. | Single source. | Custom rule functions. | V2 scan; V4 review. |
| OP-VAL-03 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |

---

## 6. Anonymous Operations

## Rules in this section

- [OP-VAL-01 — Every request type implements the generated `ContractValidate` and is validat...](../../rules/g/op-val-01.md)
- [OP-VAL-02 — Handlers MUST NOT duplicate standard input validation that the macro already ...](../../rules/c/op-val-02.md)
- [OP-VAL-03 — Validation failures map to `invalid_input` with field, code, and English mess...](../../rules/c/op-val-03.md)


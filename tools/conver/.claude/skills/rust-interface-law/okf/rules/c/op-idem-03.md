---
type: "Rule"
title: "OP-IDEM-03 — `same-transaction` stores the result in the business commit."
description: "`same-transaction` stores the result in the business commit."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-idem-03"
    title: "OP-IDEM-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-IDEM"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-IDEM-03"
x-source-part: "Part III.4"
x-source-span: "286-286"
x-verification: "V3 crash test."
---
# OP-IDEM-03

`same-transaction` stores the result in the business commit.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-IDEM |
| Source part | Part III.4 |
| Verification | V3 crash test. |
| Enforcement | cargo test -p <project>-operation/core |

[8. Idempotency](../../sources/21-operation/8-idempotency.md)

[^op-idem-03]: sources/21-OPERATION.md


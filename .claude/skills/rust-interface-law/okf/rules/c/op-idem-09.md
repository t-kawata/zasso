---
type: "Rule"
title: "OP-IDEM-09 — `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion."
description: "`same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-idem-09"
    title: "OP-IDEM-09"
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
x-rule-id: "OP-IDEM-09"
x-source-part: "Part III.4"
x-source-span: "292-292"
x-verification: "V3 crash test."
---
# OP-IDEM-09

`same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-IDEM |
| Source part | Part III.4 |
| Verification | V3 crash test. |
| Enforcement | cargo test -p <project>-operation/core |

[8. Idempotency](../../sources/21-operation/8-idempotency.md)

[^op-idem-09]: sources/21-OPERATION.md


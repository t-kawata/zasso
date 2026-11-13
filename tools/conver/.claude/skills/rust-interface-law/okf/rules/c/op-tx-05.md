---
type: "Rule"
title: "OP-TX-05 — Irreversible effects use forward recovery or isolation, not forced compensation."
description: "Irreversible effects use forward recovery or isolation, not forced compensation."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-tx-05"
    title: "OP-TX-05"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-TX"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-TX-05"
x-source-part: "Part III.4"
x-source-span: "319-319"
x-verification: "V3 failure-injection test."
---
# OP-TX-05

Irreversible effects use forward recovery or isolation, not forced compensation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-TX |
| Source part | Part III.4 |
| Verification | V3 failure-injection test. |
| Enforcement | cargo test -p <project>-operation/core |

[9. Transactions, Outbox, and Recovery](../../sources/21-operation/9-transactions-outbox-and-recovery.md)

[^op-tx-05]: sources/21-OPERATION.md


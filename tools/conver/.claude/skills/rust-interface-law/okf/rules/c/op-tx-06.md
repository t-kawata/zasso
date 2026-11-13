---
type: "Rule"
title: "OP-TX-06 — No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery."
description: "No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-tx-06"
    title: "OP-TX-06"
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
x-rule-id: "OP-TX-06"
x-source-part: "Part III.4"
x-source-span: "320-320"
x-verification: "V2 architecture scan; V3 test."
---
# OP-TX-06

No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-TX |
| Source part | Part III.4 |
| Verification | V2 architecture scan; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[9. Transactions, Outbox, and Recovery](../../sources/21-operation/9-transactions-outbox-and-recovery.md)

[^op-tx-06]: sources/21-OPERATION.md


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
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
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

[9. Transactions, Outbox, and Recovery](../../sources/part-iii-4/9-transactions-outbox-and-recovery.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [OP-TX-01 — Repositories come from the unit of work.](op-tx-01.md)
- [OP-TX-02 — Outbox intent is written in the same commit as the business mutation.](op-tx-02.md)
- [OP-TX-03 — Publication happens after commit by a relay.](op-tx-03.md)
- [OP-TX-04 — The relay retries and deduplicates by `event_id`.](op-tx-04.md)
- [OP-TX-06 — No unrelated external API wait occurs inside a database transaction. Database...](op-tx-06.md)

[^op-tx-05]: sources/EXPERT-REVIEW-PACKAGE.md


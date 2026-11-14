---
type: "Rule"
title: "OP-IDEM-07 — Failed results are stored and replayed according to policy."
description: "Failed results are stored and replayed according to policy."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-idem-07"
    title: "OP-IDEM-07"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-IDEM"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-IDEM-07"
x-source-part: "Part III.4"
x-source-span: "290-290"
x-verification: "V3 test."
---
# OP-IDEM-07

Failed results are stored and replayed according to policy.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-IDEM |
| Source part | Part III.4 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[8. Idempotency](../../sources/part-iii-4/8-idempotency.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [OP-IDEM-01 — The namespace includes subject, tenant, and operation.](op-idem-01.md)
- [OP-IDEM-02 — `claim` is atomic; concurrent claims produce one `Acquired`.](op-idem-02.md)
- [OP-IDEM-03 — `same-transaction` stores the result in the business commit.](op-idem-03.md)
- [OP-IDEM-04 — `external` uses a lease and `recover_expired`.](op-idem-04.md)
- [OP-IDEM-05 — A replay calls `replay_authorize` against the recorded target and never re-ru...](op-idem-05.md)
- [OP-IDEM-06 — Same key + different canonical request returns `conflict`.](op-idem-06.md)
- [OP-IDEM-08 — A claim carries a generation and fencing token; `complete`, `fail`, and `rene...](../g/op-idem-08.md)
- [OP-IDEM-09 — `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; t...](op-idem-09.md)
- [OP-IDEM-10 — External side effects carry the fencing token or an equivalent deduplication/...](op-idem-10.md)

[^op-idem-07]: sources/EXPERT-REVIEW-PACKAGE.md


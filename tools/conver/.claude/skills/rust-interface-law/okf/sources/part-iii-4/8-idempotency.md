---
type: "Section"
title: "8. Idempotency"
description: "The catalog declares one of:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/8-idempotency"
    title: "8. Idempotency"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/8-idempotency"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3396-3396"
---
## 8. Idempotency

The catalog declares one of:

- `none` — no idempotency;
- `same-transaction` — the idempotency record is part of the business unit of
  work;
- `external` — a leased external store with recovery.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-IDEM-01 | The namespace includes subject, tenant, and operation. | Namespace. | — | V3 test. |
| OP-IDEM-02 | `claim` is atomic; concurrent claims produce one `Acquired`. | Atomicity. | Store implementation. | V3 concurrency test. |
| OP-IDEM-03 | `same-transaction` stores the result in the business commit. | Transaction membership. | — | V3 crash test. |
| OP-IDEM-04 | `external` uses a lease and `recover_expired`. | Lease and recovery. | Lease duration. | V3 crash test. |
| OP-IDEM-05 | A replay calls `replay_authorize` against the recorded target and never re-runs `prepare`. | Replay path. | — | V3 test. |
| OP-IDEM-06 | Same key + different canonical request returns `conflict`. | Conflict rule. | Canonicalizer. | V3 test. |
| OP-IDEM-07 | Failed results are stored and replayed according to policy. | Policy declared. | Retry policy. | V3 test. |
| OP-IDEM-08 | A claim carries a generation and fencing token; `complete`, `fail`, and `renew` reject a stale owner. | Ownership proof. | Store implementation. | V3 test. |
| OP-IDEM-09 | `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion. | Atomic boundary. | — | V3 crash test. |
| OP-IDEM-10 | External side effects carry the fencing token or an equivalent deduplication/reconciliation key. | Dedup/reconcile. | Mechanism. | V3 test. |

---

## 9. Transactions, Outbox, and Recovery

## Rules in this section

- [OP-IDEM-01 — The namespace includes subject, tenant, and operation.](../../rules/c/op-idem-01.md)
- [OP-IDEM-02 — `claim` is atomic; concurrent claims produce one `Acquired`.](../../rules/c/op-idem-02.md)
- [OP-IDEM-03 — `same-transaction` stores the result in the business commit.](../../rules/c/op-idem-03.md)
- [OP-IDEM-04 — `external` uses a lease and `recover_expired`.](../../rules/c/op-idem-04.md)
- [OP-IDEM-05 — A replay calls `replay_authorize` against the recorded target and never re-ru...](../../rules/c/op-idem-05.md)
- [OP-IDEM-06 — Same key + different canonical request returns `conflict`.](../../rules/c/op-idem-06.md)
- [OP-IDEM-07 — Failed results are stored and replayed according to policy.](../../rules/c/op-idem-07.md)
- [OP-IDEM-08 — A claim carries a generation and fencing token; `complete`, `fail`, and `rene...](../../rules/g/op-idem-08.md)
- [OP-IDEM-09 — `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; t...](../../rules/c/op-idem-09.md)
- [OP-IDEM-10 — External side effects carry the fencing token or an equivalent deduplication/...](../../rules/c/op-idem-10.md)


---
type: Table
id: table/21-operation-crate-8-idempotency/1/2aed87c3d815
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 2aed87c3d8151d6717bec5cb03078c45cd4af49f2bddc27c962b08e8ffc16d39
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
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

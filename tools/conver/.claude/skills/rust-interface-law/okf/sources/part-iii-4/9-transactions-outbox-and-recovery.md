---
type: "Section"
title: "9. Transactions, Outbox, and Recovery"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/9-transactions-outbox-and-recovery"
    title: "9. Transactions, Outbox, and Recovery"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/9-transactions-outbox-and-recovery"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3422-3422"
---
## 9. Transactions, Outbox, and Recovery

```rust
pub trait ProjectUnitOfWork: UnitOfWork {
    fn accounts(&self) -> &dyn AccountRepository;
    fn calls(&self) -> &dyn CallRepository;
    // project-specific repository accessors
}

pub trait UnitOfWorkFactory: Send + Sync {
    fn begin(&self) -> BoxFuture<'_, Result<Box<dyn ProjectUnitOfWork>, DomainError>>;
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-TX-01 | Repositories come from the unit of work. | Ownership. | Concrete surface. | V2 scan; V3 test. |
| OP-TX-02 | Outbox intent is written in the same commit as the business mutation. | Atomic boundary. | Outbox implementation. | V3 crash test. |
| OP-TX-03 | Publication happens after commit by a relay. | Order. | Relay implementation. | V3 test. |
| OP-TX-04 | The relay retries and deduplicates by `event_id`. | Retry and dedup. | Backoff. | V3 test. |
| OP-TX-05 | Irreversible effects use forward recovery or isolation, not forced compensation. | Recovery declared. | Per-operation choice. | V3 failure-injection test. |
| OP-TX-06 | No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery. | External-wait ban. | Transaction time budget. | V2 architecture scan; V3 test. |

The catalog records `recovery = compensate | forward | isolate` for every
operation that has external effects.

---

## 10. Events

## Rules in this section

- [OP-TX-01 — Repositories come from the unit of work.](../../rules/c/op-tx-01.md)
- [OP-TX-02 — Outbox intent is written in the same commit as the business mutation.](../../rules/c/op-tx-02.md)
- [OP-TX-03 — Publication happens after commit by a relay.](../../rules/c/op-tx-03.md)
- [OP-TX-04 — The relay retries and deduplicates by `event_id`.](../../rules/c/op-tx-04.md)
- [OP-TX-05 — Irreversible effects use forward recovery or isolation, not forced compensation.](../../rules/c/op-tx-05.md)
- [OP-TX-06 — No unrelated external API wait occurs inside a database transaction. Database...](../../rules/c/op-tx-06.md)


---
type: "Section"
title: "7. Transaction, Outbox, and Events"
description: "```rust"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-7-transaction-outbox-and-events"
    title: "7. Transaction, Outbox, and Events"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "1179-1232"
---
## 7. Transaction, Outbox, and Events

```rust
pub struct DomainEvent {
    pub event_id: uuid::Uuid,
    pub request_id: RequestId,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
    pub aggregate_id: ResourceId,
    pub revision: u64,
    pub payload: serde_json::Value,
}

pub trait Outbox: Send + Sync {
    fn enqueue(&self, event: DomainEvent) -> Result<(), DomainError>;
}

pub trait UnitOfWork: Send + Sync {
    fn outbox(&self) -> &dyn Outbox;
    fn idempotency(&self) -> Option<&dyn IdempotencyStore>;
    fn commit(self: Box<Self>) -> BoxFuture<'static, Result<(), DomainError>>;
    fn rollback(self: Box<Self>) -> BoxFuture<'static, Result<(), DomainError>>;
}

pub trait UnitOfWorkFactory: Send + Sync {
    fn begin(&self) -> BoxFuture<'_, Result<Box<dyn UnitOfWork>, DomainError>>;
}

pub trait EventRelay: Send + Sync {
    fn publish(&self, event: &DomainEvent) -> BoxFuture<'_, Result<(), PublishError>>;
}

pub enum ExternalEffectRecovery {
    Compensate,
    ForwardRecover,
    IsolateAndRepair,
}
```

Rules:

- Repositories MUST be obtained from the `UnitOfWork`, so they share the same
  transaction. The project defines its concrete repository surface; the shared
  contract fixes that the unit of work owns repositories, outbox, and optional
  idempotency.
- Outbox intent is written in the same transaction as the business mutation.
- Publication happens after commit. The relay retries, deduplicates by
  `event_id`, and records terminal failures.
- Irreversible external effects use `ForwardRecover` or `IsolateAndRepair`;
  forced compensation is not required for effects that cannot be undone.
- A crash after commit but before publication leaves the outbox record for the
  relay; no event is lost.

---


---
type: CodeBlock
id: codeblock/10-shared-contracts-7-transaction-outbox-and-events/1/2dda23c55207
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2dda23c552074f25bb62f40c00177916df890c7de704885d79736e7ffda26a1b
source: sources/10-CONTRACTS.md
---
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

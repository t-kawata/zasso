---
type: CodeBlock
id: codeblock/20-core-crate-6-ports/1/c95c6f670eed
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c95c6f670eed2dd756d3483a31c4a76425a9eb770a2ea78838ca23388d9ecddb
source: docs/archive/IMPLEMENTATION-SPEC/20-CORE.md
---
```rust
pub trait Clock: Send + Sync {
    fn now(&self) -> chrono::DateTime<chrono::Utc>;
}

pub trait IdGenerator<I>: Send + Sync {
    fn next_id(&self) -> I;
}

pub trait Repository<T, Id>: Send + Sync {
    fn find(&self, id: Id) -> impl std::future::Future<Output = Result<Option<T>, DomainError>> + Send;
    fn save(&self, value: &T) -> impl std::future::Future<Output = Result<(), DomainError>> + Send;
    fn delete(&self, id: Id) -> impl std::future::Future<Output = Result<(), DomainError>> + Send;
}

// Transaction, outbox, and event delivery types are defined once in Part III.2 §7.
// Core owns repository ports and domain event payloads. It does not define a
// second UnitOfWork, EventPublisher, or wire event shape.

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<secrecy::SecretString, DomainError>;
}
```

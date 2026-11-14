---
type: "Section"
title: "6. Ports"
description: "Ports are the only way core reaches infrastructure."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-3/6-ports"
    title: "6. Ports"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-3/6-ports"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3011-3011"
---
## 6. Ports

Ports are the only way core reaches infrastructure.

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

A port trait is an **open extension point**: a project may add a port, but it
must not add an infrastructure dependency to core. Infrastructure implements the
port in an adapter crate.

---

## 7. Domain Errors


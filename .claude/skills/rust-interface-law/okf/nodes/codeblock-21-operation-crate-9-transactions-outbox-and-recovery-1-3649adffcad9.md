---
type: CodeBlock
id: codeblock/21-operation-crate-9-transactions-outbox-and-recovery/1/3649adffcad9
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3649adffcad9d876db4505b8624bd63ba7ce414e9f0ded565ccea2d77ef25721
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
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

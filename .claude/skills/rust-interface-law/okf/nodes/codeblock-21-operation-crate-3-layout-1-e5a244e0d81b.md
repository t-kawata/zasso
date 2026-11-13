---
type: CodeBlock
id: codeblock/21-operation-crate-3-layout/1/e5a244e0d81b
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: e5a244e0d81b242252bd2ba04aa841664f583c8b0086cdfbaf50e92cb8362a78
source: sources/21-OPERATION.md
---
```text
*-operation/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # public registry, authorizer, unit-of-work
    ├── registry/
    │   ├── mod.rs
    │   └── register_all.rs     # generated
    ├── authz/
    │   ├── mod.rs
    │   ├── authorizer.rs       # project policy
    │   └── actions.rs          # open Action set
    ├── handlers/
    │   ├── mod.rs
    │   └── <domain>/
    │       ├── mod.rs
    │       └── <operation>.rs  # create-once skeleton + hand-written body
    ├── anonymous/
    │   ├── mod.rs
    │   └── auth_token_issue.rs # auth.token.issue
    ├── error/
    │   ├── mod.rs
    │   └── mapping.rs          # DomainError -> OperationError
    ├── uow/
    │   ├── mod.rs
    │   └── factory.rs          # UnitOfWorkFactory
    └── tests/
```

---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "21-operation-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/21-OPERATION.md"
x-source-span: "35-69"
---
## 3. Layout

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

---


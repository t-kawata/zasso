---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3160-3160"
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

## 4. Dispatcher and Contexts


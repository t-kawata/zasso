---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-3/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-3/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2937-2937"
---
## 3. Layout

```text
*-core/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   ├── mod.rs          # public re-exports
    │   └── errors.rs       # public error surface
    ├── model/
    │   ├── mod.rs
    │   ├── <aggregate>.rs  # domain entities and value objects
    │   └── ids.rs          # typed IDs
    ├── state/
    │   ├── mod.rs
    │   └── <aggregate>_state.rs
    ├── ports/
    │   ├── mod.rs
    │   ├── clock.rs
    │   ├── id_generator.rs
    │   ├── repository.rs
    │   ├── unit_of_work.rs
    │   ├── event_publisher.rs
    │   └── secret_store.rs
    ├── error/
    │   ├── mod.rs
    │   └── domain_error.rs
    ├── config/
    │   └── mod.rs          # domain configuration values
    └── tests/
        └── mod.rs          # test material only; no production behavior
```

The public module layout is fixed. Hand-written files inside `model/`,
`state/`, and `ports/` may be organized differently as long as the public
re-exports and generated boundaries are preserved. The project chooses its own
resource identifier encoding; UUID is not mandatory.

---

## 4. Public API


---
type: CodeBlock
id: codeblock/20-core-crate-3-layout/1/90d9e448719d
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 90d9e448719decf24afcb4ad5e6b1df5aabe4a417057c6982aea0da28f481287
source: sources/20-CORE.md
---
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

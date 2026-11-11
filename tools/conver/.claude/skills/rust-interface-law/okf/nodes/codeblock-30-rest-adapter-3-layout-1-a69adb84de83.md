---
type: CodeBlock
id: codeblock/30-rest-adapter-3-layout/1/a69adb84de83
phase: adapter
delivery: must
applies_to: rest
requires: []
references: []
content_sha256: a69adb84de8326dc8d1d59430b24b89557c9861ed306d0c7c709ebdfe77eaf5e
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
```text
*-rest/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # router, state, public re-exports
    ├── state.rs                # RestState, RestConfig
    ├── auth/
    │   ├── mod.rs
    │   └── bearer.rs           # Bearer extraction and middleware
    ├── routes/
    │   ├── mod.rs
    │   ├── public.rs           # /health, /auth/*
    │   └── protected.rs        # generated route registration
    ├── handlers/
    │   └── generated.rs        # generated per-operation handlers
    ├── schema/
    │   ├── mod.rs
    │   └── generated.rs        # generated REST request/response schemas
    ├── response/
    │   ├── mod.rs
    │   └── error.rs            # OperationError -> HTTP
    ├── openapi/
    │   └── generated.rs        # generated OpenApi document
    └── tests/
```

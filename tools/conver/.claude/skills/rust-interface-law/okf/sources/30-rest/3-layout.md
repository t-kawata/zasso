---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "39-70"
---
## 3. Layout

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

---


---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3912-3912"
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

## 4. Public API


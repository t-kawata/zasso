---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-9/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-9/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4755-4755"
---
## 3. Layout

```text
*-grpc/
├── Cargo.toml
├── build.rs                     # tonic-prost-build
├── proto/
│   └── <project>.v1.proto       # generated from the catalog, checked in
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs               # service(), GrpcState, GrpcConfig
    ├── generated/
    │   └── mod.rs               # include_proto!
    ├── service/
    │   ├── mod.rs
    │   ├── unary.rs             # generated per-operation methods
    │   └── stream.rs            # S/C/B methods
    ├── auth/
    │   ├── mod.rs
    │   └── metadata.rs          # Bearer extraction and verification layer
    ├── conversion/
    │   ├── mod.rs
    │   └── generated.rs         # proto <-> operation request/response
    ├── error/
    │   └── status.rs            # OperationError -> Status
    └── tests/
```

Generated files carry `// @generated`. `proto/<project>.v1.proto` is generated
and checked in so that field numbers are reviewed; it is not edited by hand.

---

## 4. Public API


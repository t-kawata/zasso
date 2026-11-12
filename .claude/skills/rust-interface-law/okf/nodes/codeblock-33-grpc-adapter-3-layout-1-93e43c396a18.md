---
type: CodeBlock
id: codeblock/33-grpc-adapter-3-layout/1/93e43c396a18
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: 93e43c396a188ed149d3fbabea9966cea5f52ca5f8d4865e4e523879bc36ab64
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
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

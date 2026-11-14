---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "73-96"
---
## 4. Public API

```rust
pub struct GrpcState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: GrpcConfig,
}

pub struct GrpcConfig {
    pub audience: identity_core::Audience,
    pub max_message_bytes: usize,       // default 1 MiB
    pub keepalive_interval: std::time::Duration,
    pub keepalive_timeout: std::time::Duration,
}

pub fn service(state: GrpcState) -> tonic::transport::server::Router;
```

The service is generated from the catalog. Every operation has one RPC. The
mode (`U`, `S`, `C`, `B`) is declared in the catalog and reflected in the proto.

---


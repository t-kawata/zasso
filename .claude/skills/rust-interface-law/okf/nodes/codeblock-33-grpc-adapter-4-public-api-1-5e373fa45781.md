---
type: CodeBlock
id: codeblock/33-grpc-adapter-4-public-api/1/5e373fa45781
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: 5e373fa4578102ad6fbb055bea5b70ae103bdb3eddcefedbda7fac382df2257a
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
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

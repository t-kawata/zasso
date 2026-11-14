---
type: "Section"
title: "5.3 Anonymous operation"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-3-anonymous-operation"
    title: "5.3 Anonymous operation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-3-anonymous-operation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1932-1932"
---
### 5.3 Anonymous operation

```rust
pub trait AnonymousOperation: Send + Sync + 'static {
    type Request: serde::de::DeserializeOwned
        + validation_contract::ContractValidate
        + Send
        + 'static;
    type Response: serde::Serialize + Send + 'static;
    type Prepared: Send + 'static;

    const ID: OperationId;
    const MODE: OperationMode = OperationMode::Unary;

    fn prepare(
        &self,
        ctx: &AnonymousContext,
        request: Self::Request,
    ) -> BoxFuture<'_, Result<Self::Prepared, OperationError>>;

    fn execute(
        &self,
        ctx: AnonymousContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>>;

    fn execute_server_stream(
        &self,
        _ctx: AnonymousContext,
        _prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a server stream")) })
    }

    fn execute_client_stream(
        &self,
        _ctx: AnonymousContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a client stream")) })
    }

    fn execute_bidi(
        &self,
        _ctx: AnonymousContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not bidirectional")) })
    }
}
```

### 5.4 Streams


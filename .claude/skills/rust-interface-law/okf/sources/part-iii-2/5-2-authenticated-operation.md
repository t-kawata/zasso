---
type: "Section"
title: "5.2 Authenticated operation"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-2-authenticated-operation"
    title: "5.2 Authenticated operation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-2-authenticated-operation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1866-1866"
---
### 5.2 Authenticated operation

```rust
pub trait Operation: Send + Sync + 'static {
    type Request: serde::de::DeserializeOwned
        + validation_contract::ContractValidate
        + Send
        + 'static;
    type Response: serde::Serialize + Send + 'static;
    type Prepared: Send + 'static;

    const ID: OperationId;
    const SCOPE: Scope;
    const AUTH: AuthenticationRequirement = AuthenticationRequirement::Required;
    const MODE: OperationMode = OperationMode::Unary;

    /// Validate and authorize. No side effect is allowed here.
    fn prepare<'a>(
        &'a self,
        ctx: &'a AuthenticatedContext,
        request: Self::Request,
    ) -> BoxFuture<'a, Result<Self::Prepared, OperationError>>;

    /// Replay authorization is deliberately separate from prepare.
    /// It checks current access against the recorded target; it does not
    /// re-run creation preconditions, duplicate checks, or state transitions.
    fn replay_authorize<'a>(
        &'a self,
        ctx: &'a AuthenticatedContext,
        replay: &'a ReplayRecord,
    ) -> BoxFuture<'a, Result<(), OperationError>>;

    fn execute(
        &self,
        ctx: AuthenticatedContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>>;

    fn execute_server_stream(
        &self,
        _ctx: AuthenticatedContext,
        _prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a server stream")) })
    }

    fn execute_client_stream(
        &self,
        _ctx: AuthenticatedContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a client stream")) })
    }

    fn execute_bidi(
        &self,
        _ctx: AuthenticatedContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not bidirectional")) })
    }
}
```

### 5.3 Anonymous operation


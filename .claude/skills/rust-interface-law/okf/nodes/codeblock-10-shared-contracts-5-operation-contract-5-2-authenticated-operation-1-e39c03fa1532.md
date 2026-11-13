---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-2-authenticated-operation/1/e39c03fa1532
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: e39c03fa15324be2c048f72816069a13b3174d04dce9f90c8b15983511809dd9
source: sources/10-CONTRACTS.md
---
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

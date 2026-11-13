---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-5-erased-registry/1/372fc9ea03ac
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 372fc9ea03ac6ae0a277e6388dbdba62f7731d1ef61a82dfd4f7259c704d4844
source: sources/10-CONTRACTS.md
---
```rust
pub enum ErasedOperation {
    Authenticated(std::sync::Arc<dyn ErasedAuthenticatedOperation>),
    Anonymous(std::sync::Arc<dyn ErasedAnonymousOperation>),
}

pub trait ErasedAuthenticatedOperation: Send + Sync {
    fn id(&self) -> OperationId;
    fn mode(&self) -> OperationMode;

    /// Deserialize and run the generated input validator. This is stateless
    /// validation and runs before the idempotency claim. It MUST NOT run
    /// business `prepare` or state-dependent preconditions.
    fn validate_json(
        &self,
        request: &serde_json::Value,
    ) -> Result<ErasedValidated, OperationError>;

    /// State-dependent preparation and business authorization. Called only on
    /// the newly-acquired branch, never on replay.
    fn prepare_validated(
        &self,
        ctx: &AuthenticatedContext,
        validated: ErasedValidated,
    ) -> BoxFuture<'_, Result<ErasedPrepared, OperationError>>;

    fn execute_json(
        &self,
        ctx: AuthenticatedContext,
        prepared: ErasedPrepared,
    ) -> BoxFuture<'_, Result<OperationResultBody, OperationError>>;

    fn execute_stream_json(
        &self,
        ctx: AuthenticatedContext,
        prepared: ErasedPrepared,
        input: Option<RequestStream<serde_json::Value>>,
    ) -> BoxFuture<'_, Result<ResponseStream<serde_json::Value>, OperationError>>;
}

pub trait ErasedAnonymousOperation: Send + Sync {
    fn id(&self) -> OperationId;
    fn mode(&self) -> OperationMode;

    fn validate_json(
        &self,
        request: &serde_json::Value,
    ) -> Result<ErasedValidated, OperationError>;

    fn prepare_validated(
        &self,
        ctx: &AnonymousContext,
        validated: ErasedValidated,
    ) -> BoxFuture<'_, Result<ErasedPrepared, OperationError>>;

    fn execute_json(
        &self,
        ctx: AnonymousContext,
        prepared: ErasedPrepared,
    ) -> BoxFuture<'_, Result<OperationResultBody, OperationError>>;

    fn execute_stream_json(
        &self,
        ctx: AnonymousContext,
        prepared: ErasedPrepared,
        input: Option<RequestStream<serde_json::Value>>,
    ) -> BoxFuture<'_, Result<ResponseStream<serde_json::Value>, OperationError>>;
}

/// Opaque prepared state. Produced by `prepare_validated` and consumed by the same
/// erased operation's `execute_json` / `execute_stream_json`.
///
/// It preserves the authentication kind (authenticated or anonymous) and the
/// operation mode (unary, server stream, client stream, bidirectional). The
/// internal representation is owned by the shared crate and is not a public
/// contract; projects must not name or construct it.
pub struct ErasedValidated { /* opaque */ }

pub struct ErasedPrepared { /* opaque */ }

pub struct OperationRegistry {
    operations: std::collections::BTreeMap<OperationId, ErasedOperation>,
}

impl OperationRegistry {
    pub fn register<O: Operation>(&mut self, operation: O);
    pub fn register_anonymous<O: AnonymousOperation>(&mut self, operation: O);
    pub fn get(&self, id: OperationId) -> Option<&ErasedOperation>;
    pub fn ids(&self) -> impl Iterator<Item = OperationId> + '_;
}
```

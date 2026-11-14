---
type: "Section"
title: "5.5 Erased registry"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-5-erased-registry"
    title: "5.5 Erased registry"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-5-erased-registry"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2041-2041"
---
### 5.5 Erased registry

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

`ErasedValidated` and `ErasedPrepared` are opaque values owned by the shared
crate. The erased operation that produced a value is its only consumer. It MUST
reject a value whose authentication kind or operation mode does not match the
requested execution. The dispatcher does not inspect or reconstruct either
value.

`validate_json` runs before the idempotency claim. `prepare_validated` runs only
on the newly-acquired branch. Replay calls `replay_authorize` and never calls
`prepare_validated`.

The registry rejects duplicate IDs. A catalog entry with no registration fails
startup.

### 5.6 Dispatcher


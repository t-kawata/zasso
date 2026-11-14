---
type: "Section"
title: "5. Operation Contract"
description: "```rust"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-5-operation-contract"
    title: "5. Operation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "433-1043"
---
## 5. Operation Contract

### 5.1 Modes

```rust
pub enum OperationMode {
    Unary,
    ServerStream,
    ClientStream,
    Bidirectional,
}
```

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

```rust
pub struct RequestStream<T> {
    // The receiving side of an adapter-fed stream.
}

pub struct RequestStreamSender<T> {
    // The adapter's sending side.
}

impl<T> RequestStream<T> {
    pub fn channel(capacity: usize) -> (RequestStreamSender<T>, Self);
    pub fn next(&mut self) -> BoxFuture<'_, Option<Result<T, OperationError>>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
    pub fn is_cancelled(&self) -> bool;
}

impl<T> RequestStreamSender<T> {
    pub fn push(&mut self, item: T) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn close(&mut self) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
}

pub struct ResponseStream<T> {
    // The receiving side consumed by the adapter.
}

pub struct ResponseStreamSender<T> {
    // The operation's sending side.
}

impl<T> ResponseStream<T> {
    pub fn channel(capacity: usize) -> (ResponseStreamSender<T>, Self);
    pub fn next(&mut self) -> BoxFuture<'_, Option<Result<T, OperationError>>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
    pub fn backpressure(&self) -> std::time::Duration;
}

impl<T> ResponseStreamSender<T> {
    pub fn push(&mut self, item: T) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn close(&mut self) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn fail(&mut self, error: OperationError) -> BoxFuture<'_, Result<(), OperationError>>;
}
```

Stream semantics are fixed:

- `None` from `next` means normal EOF.
- `Some(Err(_))` means abnormal termination.
- `cancel` is idempotent and must release resources.
- Backpressure is explicit; the producer must not buffer unboundedly.
- The dispatcher owns cancellation propagation from the interface to the
  operation.

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

The dispatcher belongs to `operation-contract`, not to a project crate. This is
what lets it construct contexts and enforce the binding checks.

```rust
pub struct Dispatcher {
    registry: std::sync::Arc<OperationRegistry>,
    verifier: std::sync::Arc<dyn AccessTokenVerifier>,
    idempotency: std::sync::Arc<dyn IdempotencyStore>,
    results: std::sync::Arc<dyn ResultStore>,
    revocation: std::sync::Arc<dyn RevocationChecker>,
    clock: ClockFn,
    limits: DispatchLimits,
}

pub struct ServerStreamHandle {
    pub request_id: RequestId,
    pub output: ResponseStream<serde_json::Value>,
}

pub struct ClientStreamHandle {
    pub request_id: RequestId,
    pub input: RequestStreamSender<serde_json::Value>,
    pub completion: BoxFuture<'static, Result<OperationResultBody, OperationError>>,
}

pub struct BidiStreamHandle {
    pub request_id: RequestId,
    pub input: RequestStreamSender<serde_json::Value>,
    pub output: ResponseStream<serde_json::Value>,
}

impl Dispatcher {
    pub fn new(
        registry: std::sync::Arc<OperationRegistry>,
        verifier: std::sync::Arc<dyn AccessTokenVerifier>,
        idempotency: std::sync::Arc<dyn IdempotencyStore>,
        results: std::sync::Arc<dyn ResultStore>,
        revocation: std::sync::Arc<dyn RevocationChecker>,
        clock: ClockFn,
        limits: DispatchLimits,
    ) -> Self;

    /// Always returns a body containing request_id and either result or error.
    pub fn execute_with_credential(
        &self,
        interface: InterfaceId,
        audience: Audience,
        credential: &str,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, OperationResultBody>;

    /// Always returns a body containing request_id and either result or error.
    pub fn execute_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, OperationResultBody>;

    /// Always returns a body containing request_id and either result or error.
    pub fn execute_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, OperationResultBody>;

    pub fn execute_server_stream_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, Result<ServerStreamHandle, OperationResultBody>>;

    pub fn execute_server_stream_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, Result<ServerStreamHandle, OperationResultBody>>;

    pub fn execute_client_stream_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, Result<ClientStreamHandle, OperationResultBody>>;

    pub fn execute_client_stream_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, Result<ClientStreamHandle, OperationResultBody>>;

    pub fn execute_bidi_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, Result<BidiStreamHandle, OperationResultBody>>;

    pub fn execute_bidi_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, Result<BidiStreamHandle, OperationResultBody>>;

    /// Authorized result lookup. The caller must be the recorded subject or an
    /// authorized operator in the recorded tenant.
    pub fn get_result(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        request_id: RequestId,
    ) -> BoxFuture<'_, Result<Option<OperationResultBody>, OperationError>>;
}
```

`execute_verified` MUST reject an identity whose binding does not match
`interface`, `audience`, or `expires_at`, and MUST consult the configured
`RevocationChecker` (Part III.2 §3.4). `execute_anonymous` MUST reject an
operation whose `AUTH` is `Required`.

The stream methods are the only public route from an adapter to an operation
stream. The typed operation's stream is converted to the erased
`serde_json::Value` handle by `operation-contract`; the adapter never calls a
handler directly.

### 5.7 Pipeline

The dispatcher and the operation share this fixed partial order:

```text
1. decode and size check                     dispatcher
2. authenticate (or establish anonymity)     dispatcher
3. authentication requirement check          dispatcher
4. scope check                               dispatcher
5. deadline and admission                    dispatcher
6. generated input validation                 dispatcher/operation
7. idempotency claim                          dispatcher
8a. replay branch: replay_authorize the
    recorded target; return stored result     operation
8b. acquired branch: prepare (schema/domain
    validation, resource load, tenant/
    ownership authorization)                  operation
9. execute: reservation, mutation,
   commit, outbox enqueue                     operation
10. result store / reply                      dispatcher
```

No business side effect may occur before authorization succeeds.

- **Validation (6):** runs for both replay and new requests, before the claim.
  It is stateless input validation; state-dependent preconditions, resource
  loading, and ownership authorization stay in `prepare`.
- **Replay branch (8a):** the dispatcher returns the stored result after
  `replay_authorize` confirms the current caller may access the recorded
  target. `prepare` is not run; delete, create, and approve operations must not
  fail their own retry because their first success changed the state.
- **Acquired branch (8b):** `prepare` validates and authorizes before
  `execute`. No side effect occurs before it succeeds.

For create operations with no existing resource, `prepare` authorizes against
the tenant or a declared global target:

```rust
pub enum AuthorizationTarget {
    Resource(std::sync::Arc<dyn ResourceRef>),
    Tenant(TenantId),
    Global,
}

#[derive(Clone)]
pub struct AuthorizationTargetSnapshot {
    pub action: Action,
    pub resource_id: Option<ResourceId>,
    pub tenant: Option<TenantId>,
    pub owner: Option<SubjectId>,
}

#[derive(Clone)]
pub struct ReplayRecord {
    pub request_id: RequestId,
    pub operation: OperationId,
    pub request_hash: [u8; 32],
    pub target: AuthorizationTargetSnapshot,
    pub result: OperationResultBody,
}
```

### 5.8 Errors

```rust
pub struct OperationError {
    pub code: ErrorCode,
    pub domain: ErrorDomain,
    pub retryable: bool,
    pub details: Option<serde_json::Value>,
    pub source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationErrorBody {
    pub code: ErrorCode,
    pub domain: ErrorDomain,
    pub retryable: bool,
    pub details: Option<serde_json::Value>,
}

impl OperationError {
    pub fn unsupported(message: &'static str) -> Self;
    pub fn category(&self) -> ErrorCategory;
    pub fn to_body(&self) -> OperationErrorBody;
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorCategory {
    InvalidInput,
    InvalidConfig,
    Unauthenticated,
    PermissionDenied,
    NotFound,
    AlreadyExists,
    InvalidState,
    Conflict,
    ResourceExhausted,
    Unsupported,
    Timeout,
    Cancelled,
    Unavailable,
    Internal,
}

pub struct ContractError(pub &'static str);

pub struct PublishError {
    pub retryable: bool,
    pub message: String,
}

pub type ClockFn = std::sync::Arc<dyn Fn() -> std::time::SystemTime + Send + Sync>;

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationResultBody {
    pub request_id: RequestId,
    pub result: Option<serde_json::Value>,
    pub error: Option<OperationErrorBody>,
}

impl OperationResultBody {
    pub fn success(request_id: RequestId, result: serde_json::Value) -> Self;
    pub fn failure(request_id: RequestId, error: OperationErrorBody) -> Self;
}

pub struct OperationResultRecord {
    pub result: OperationResultBody,
    pub subject: Option<SubjectId>,
    pub tenant: Option<TenantId>,
    pub operation: OperationId,
}

pub trait ResultStore: Send + Sync {
    fn get(&self, request_id: RequestId)
        -> Result<Option<OperationResultRecord>, OperationError>;
    fn put(&self, record: OperationResultRecord) -> Result<(), OperationError>;
}

pub enum RevocationFailMode {
    FailClosed,
    AllowWithinStaleness,
}

pub struct RevocationPolicy {
    pub max_staleness: std::time::Duration,
    pub on_unavailable: RevocationFailMode,
}

pub trait RevocationChecker: Send + Sync {
    fn check(&self, identity: &VerifiedIdentity) -> Result<(), AuthenticationError>;
}
```

The protocol category table is fixed; adapters use `OperationErrorBody`, never
the internal `source`.

---


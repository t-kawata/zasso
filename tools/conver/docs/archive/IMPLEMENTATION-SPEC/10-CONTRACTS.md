# 10 — Shared Contracts

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Rule registry:** Part III.15

These contracts are the **closed seams**. Their shape is fixed so that every
project and every interface can be compared, generated, and conformance-tested.
Their **contents** remain open: operations, scopes, error codes, auth methods,
interfaces, and domain types may grow without changing these shapes.

This revision addresses the review findings R-001 through R-016. The changes
are normative and supersede the previous version.

---

## 1. Identifier Types

All identifiers are newtypes. Open identifiers provide explicit constructors so
that other crates do not need private-field access.

```rust
pub type BoxFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SubjectId(uuid::Uuid);

impl SubjectId {
    pub const fn from_uuid(value: uuid::Uuid) -> Self { Self(value) }
    pub const fn as_uuid(&self) -> uuid::Uuid { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TenantId(uuid::Uuid);
impl TenantId {
    pub const fn from_uuid(value: uuid::Uuid) -> Self { Self(value) }
    pub const fn as_uuid(&self) -> uuid::Uuid { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SessionId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ActorId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RequestId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TraceId(uuid::Uuid);

#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct IdempotencyKey(Box<str>);
impl IdempotencyKey {
    pub fn parse(value: impl Into<Box<str>>) -> Result<Self, ContractError>;
    pub fn as_str(&self) -> &str;
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct OperationId(&'static str);
impl OperationId {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Scope(&'static str);
impl Scope {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Audience(&'static str);
impl Audience {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct InterfaceId(&'static str);
impl InterfaceId {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ErrorCode(&'static str);
impl ErrorCode {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ErrorDomain(&'static str);
impl ErrorDomain {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Action(&'static str);
impl Action {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AuthMethod(&'static str);
impl AuthMethod {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TokenId(Box<str>);
impl TokenId {
    pub fn parse(value: impl Into<Box<str>>) -> Result<Self, ContractError>;
    pub fn as_str(&self) -> &str;
}
```

`ScopeSet` is a public, constructible value:

```rust
#[derive(Clone, Default, PartialEq, Eq)]
pub struct ScopeSet(Vec<Scope>);

impl ScopeSet {
    pub fn new() -> Self;
    pub fn from_scopes(scopes: impl IntoIterator<Item = Scope>) -> Self;
    pub fn insert(&mut self, scope: Scope) -> bool;
    pub fn contains(&self, scope: Scope) -> bool;
    pub fn iter(&self) -> impl Iterator<Item = Scope> + '_;
    pub fn is_subset_of(&self, parent: &ScopeSet) -> bool;
}
```

`ResourceId` is intentionally open. A project may use a UUID, a content hash, a
composite key, or a string:

```rust
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ResourceId(Box<str>);
impl ResourceId {
    pub fn new(value: impl Into<Box<str>>) -> Self;
    pub fn as_str(&self) -> &str;
}
```

---

## 2. Verified Identity and Credential Binding

The verifier returns an opaque identity that carries **what was verified, where,
and until when**. The identity alone is not enough to authorize use through a
different interface or audience.

```rust
#[derive(Clone)]
pub struct VerifiedIdentity {
    subject: SubjectId,
    tenant: Option<TenantId>,
    scopes: ScopeSet,
    session_id: Option<SessionId>,
    actor: Option<ActorId>,
    on_behalf_of: Option<SubjectId>,
    binding: CredentialBinding,
}

#[derive(Clone)]
pub struct CredentialBinding {
    interface: InterfaceId,
    audience: Audience,
    method: AuthMethod,
    authenticated_at: std::time::SystemTime,
    expires_at: std::time::SystemTime,
    token_id: Option<TokenId>,
    token_version: u64,
}

impl VerifiedIdentity {
    pub fn subject(&self) -> SubjectId;
    pub fn tenant(&self) -> Option<TenantId>;
    pub fn scopes(&self) -> &ScopeSet;
    pub fn session_id(&self) -> Option<SessionId>;
    pub fn actor(&self) -> Option<ActorId>;
    pub fn on_behalf_of(&self) -> Option<SubjectId>;
    pub fn binding(&self) -> &CredentialBinding;

    // Only identity-core may construct this value.
    pub(crate) fn from_verified(parts: VerifiedParts) -> Self;
}

impl CredentialBinding {
    pub fn interface(&self) -> InterfaceId;
    pub fn audience(&self) -> Audience;
    pub fn method(&self) -> AuthMethod;
    pub fn expires_at(&self) -> std::time::SystemTime;
    pub fn token_id(&self) -> Option<&TokenId>;
    pub fn token_version(&self) -> u64;
    pub fn is_valid_at(&self, now: std::time::SystemTime) -> bool;
}

pub(crate) struct VerifiedParts {
    pub subject: SubjectId,
    pub tenant: Option<TenantId>,
    pub scopes: ScopeSet,
    pub session_id: Option<SessionId>,
    pub actor: Option<ActorId>,
    pub on_behalf_of: Option<SubjectId>,
    pub binding: CredentialBinding,
}
```

### 2.1 Sealed construction

`VerifiedIdentity` has private fields and no public constructor. The JWT
verifier and the session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features; `identity-jwt` is a facade. This makes ID-03 a
compile-time property.

A project that wants a verifier outside `identity-core` must use the declared
static-check alternative (V2: only the trusted verifier crate may call
`from_verified`) and record the exception in `RULES-PROFILE.toml`. The
specification does not treat an import scan as equivalent to compile-time
sealing.

### 2.2 Binding checks

The dispatcher MUST reject an identity whose binding does not match the
invocation:

```rust
binding.interface() == invocation.interface
binding.audience() == invocation.audience
binding.is_valid_at(now)
```

A verified REST identity cannot be reused with a WebSocket audience. A session
ticket redeemed for WebSocket creates a **new binding** with the WebSocket
interface and the WebSocket audience; the ticket's redemption deadline and the
connection's authentication expiry are separate values.

### 2.3 Delegation

`sub` is the subject. `act` is the actor. `on_behalf_of` is the delegated
subject. The verifier MUST validate that:

- the actor is authorized to act for the subject;
- the delegated scopes are a subset of both the actor's and the subject's
  scopes;
- `on_behalf_of` is explicit and is never inferred from `sub`.

---

## 3. Authentication Contracts

```rust
pub trait AccessTokenVerifier: Send + Sync {
    fn verify(
        &self,
        token: &str,
        audience: &Audience,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}

pub trait TokenIssuer: Send + Sync {
    fn issue(
        &self,
        user: &AuthenticatedUser,
        scopes: &ScopeSet,
        audience: &Audience,
    ) -> Result<TokenPair, AuthenticationError>;
}

pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &AuthenticatedUser,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}

pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub struct TokenPair {
    pub access_token: secrecy::SecretString,
    pub refresh_token: Option<secrecy::SecretString>,
    pub expires_in: std::time::Duration,
}

pub enum AuthenticationError {
    Missing,
    Malformed,
    UnsupportedAlgorithm,
    InvalidSignature,
    Expired,
    NotYetValid,
    WrongIssuer,
    WrongAudience,
    WrongTokenType,
    UnknownKey,
    Revoked,
    VersionMismatch,
    DelegationInvalid,
    Provider(String),
}
```

`CredentialVerifier` has a typed API and an erased API for `dyn` use:

```rust
pub trait CredentialVerifier: Send + Sync {
    type Credential: Send;
    fn verify(&self, credential: Self::Credential)
        -> Result<AuthenticatedUser, AuthenticationError>;
}

pub trait ErasedCredentialVerifier: Send + Sync {
    fn verify_json(
        &self,
        credential: serde_json::Value,
    ) -> Result<AuthenticatedUser, AuthenticationError>;
}
```

`SsoProvider` is the open extension point:

```rust
pub trait SsoProvider: Send + Sync {
    type Callback: Send;
    fn authorization_url(&self, state: &str, nonce: &str) -> String;
    fn exchange(&self, callback: Self::Callback)
        -> Result<ExternalIdentity, AuthenticationError>;
}

pub struct ExternalIdentity {
    pub issuer: String,
    pub subject: String,
    pub claims: serde_json::Value,
}

pub trait ExternalIdentityRepository: Send + Sync {
    fn find(
        &self,
        issuer: &str,
        subject: &str,
    ) -> Result<Option<SubjectId>, AuthenticationError>;

    fn link(
        &self,
        subject: SubjectId,
        issuer: &str,
        external_subject: &str,
    ) -> Result<(), AuthenticationError>;
}
```

---

## 4. Invocation Contexts

Authentication requirement is separate from scope. An operation is either
authenticated or anonymous; `public` is not a scope and does not mean
"unauthenticated".

```rust
pub enum AuthenticationRequirement {
    Required,
    Anonymous,
}

pub struct InvocationContext {
    request_id: RequestId,
    interface: InterfaceId,
    audience: Audience,
    deadline: Option<std::time::Instant>,
    idempotency_key: Option<IdempotencyKey>,
    trace_id: Option<TraceId>,
}

pub struct AuthenticatedContext {
    invocation: InvocationContext,
    identity: std::sync::Arc<VerifiedIdentity>,
    execution: ExecutionScope,
}

pub struct AnonymousContext {
    invocation: InvocationContext,
    peer: PeerInfo,
}

pub struct PeerInfo {
    pub remote_addr: Option<String>,
    pub user_agent: Option<String>,
}

impl InvocationContext {
    pub fn request_id(&self) -> RequestId;
    pub fn interface(&self) -> InterfaceId;
    pub fn audience(&self) -> Audience;
    pub fn deadline(&self) -> Option<std::time::Instant>;
    pub fn idempotency_key(&self) -> Option<IdempotencyKey>;
    pub fn trace_id(&self) -> Option<TraceId>;
}

impl AuthenticatedContext {
    pub fn invocation(&self) -> &InvocationContext;
    pub fn identity(&self) -> &VerifiedIdentity;
    pub fn tenant(&self) -> Option<TenantId>;
    pub fn execution(&self) -> &ExecutionScope;
}

impl AnonymousContext {
    pub fn invocation(&self) -> &InvocationContext;
    pub fn peer(&self) -> &PeerInfo;
}
```

The dispatcher constructs these contexts. Adapters cannot construct an
`AuthenticatedContext` with an arbitrary identity, and they cannot turn an
authenticated identity into an anonymous one.

`interface` is available for logging and metrics. Business behavior MUST NOT
branch on `interface`; a conformance check rejects such branching.

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

## 6. Idempotency

Idempotency is namespaced by authenticated subject, tenant, and operation. A key
alone is not a global namespace. Every claim carries an ownership handle and a
fencing generation so that an expired worker cannot commit after a new owner has
acquired the work.

```rust
pub struct IdempotencyNamespace {
    pub subject: Option<SubjectId>,
    pub tenant: Option<TenantId>,
    pub operation: OperationId,
}

pub enum IdempotencyMode {
    None,
    SameTransaction,
    External,
}

pub enum IdempotencyState {
    InFlight,
    Completed,
    Failed,
}

pub struct IdempotencyRecord {
    pub namespace: IdempotencyNamespace,
    pub key: IdempotencyKey,
    pub request_hash: [u8; 32],
    pub state: IdempotencyState,
    pub result: Option<OperationResultBody>,
    pub target: AuthorizationTargetSnapshot,
    pub owner: Option<SubjectId>,
    pub generation: u64,
    pub fencing_token: u64,
    pub lease_until: std::time::SystemTime,
}

#[derive(Clone)]
pub struct ClaimToken {
    pub namespace: IdempotencyNamespace,
    pub key: IdempotencyKey,
    pub generation: u64,
    pub fencing_token: u64,
}

pub enum ClaimOutcome {
    Acquired(ClaimToken),
    InFlight,
    Replay(ReplayRecord),
    Conflict,
}

pub trait IdempotencyStore: Send + Sync {
    fn claim(
        &self,
        namespace: &IdempotencyNamespace,
        key: &IdempotencyKey,
        request_hash: [u8; 32],
        target: AuthorizationTargetSnapshot,
        lease: std::time::Duration,
    ) -> BoxFuture<'_, Result<ClaimOutcome, OperationError>>;

    fn renew(
        &self,
        token: &ClaimToken,
        lease: std::time::Duration,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn complete(
        &self,
        token: &ClaimToken,
        result: &OperationResultBody,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn fail(
        &self,
        token: &ClaimToken,
        error: &OperationErrorBody,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn recover_expired(
        &self,
        now: std::time::SystemTime,
    ) -> BoxFuture<'_, Result<usize, OperationError>>;
}

pub struct ExecutionScope {
    claim: Option<ClaimToken>,
    store: Option<std::sync::Arc<dyn IdempotencyStore>>,
    completed: std::sync::atomic::AtomicBool,
}

impl ExecutionScope {
    pub fn complete(&self, result: &OperationResultBody) -> Result<(), OperationError>;
    pub fn complete_response<T: serde::Serialize>(
        &self,
        request_id: RequestId,
        response: &T,
    ) -> Result<(), OperationError>;
    pub fn fail(&self, error: &OperationErrorBody) -> Result<(), OperationError>;
    pub fn is_completed(&self) -> bool;
}
```

Rules:

- `claim` is atomic. Concurrent claims for the same namespace and key produce
  exactly one `Acquired`; the others receive `InFlight`, `Replay`, or
  `Conflict`.
- `ClaimToken` is the ownership proof. `complete`, `fail`, and `renew` MUST
  reject a stale generation or fencing token. An expired worker that resumes
  after a new owner acquired the work MUST NOT commit a side effect or a
  result.
- `SameTransaction` mode: the dispatcher gives the handler an
  `ExecutionScope` backed by the transaction-bound store. The handler MUST call
  `scope.complete` or `scope.fail` before `uow.commit`. The dispatcher verifies
  `scope.is_completed()`; a handler that commits without completing is a
  protocol violation.
- `External` mode: the dispatcher completes after `execute` and renews the
  lease while the operation is running. A crash after business commit but
  before result storage is recovered by `recover_expired` and the operation's
  declared recovery policy.
- Replay MUST call `Operation::replay_authorize` against the recorded
  `AuthorizationTargetSnapshot`. It MUST NOT re-run `prepare`; delete,
  create, and approve operations would otherwise reject a legitimate retry
  after their own first success.
- External side effects MUST carry the fencing token or provide an equivalent
  deduplication/reconciliation mechanism.
- The request hash uses canonical JSON (RFC 8785 JCS or a declared
  project-equivalent canonicalizer).

---

## 7. Transaction, Outbox, and Events

```rust
pub struct DomainEvent {
    pub event_id: uuid::Uuid,
    pub request_id: RequestId,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
    pub aggregate_id: ResourceId,
    pub revision: u64,
    pub payload: serde_json::Value,
}

pub trait Outbox: Send + Sync {
    fn enqueue(&self, event: DomainEvent) -> Result<(), DomainError>;
}

pub trait UnitOfWork: Send + Sync {
    fn outbox(&self) -> &dyn Outbox;
    fn idempotency(&self) -> Option<&dyn IdempotencyStore>;
    fn commit(self: Box<Self>) -> BoxFuture<'static, Result<(), DomainError>>;
    fn rollback(self: Box<Self>) -> BoxFuture<'static, Result<(), DomainError>>;
}

pub trait UnitOfWorkFactory: Send + Sync {
    fn begin(&self) -> BoxFuture<'_, Result<Box<dyn UnitOfWork>, DomainError>>;
}

pub trait EventRelay: Send + Sync {
    fn publish(&self, event: &DomainEvent) -> BoxFuture<'_, Result<(), PublishError>>;
}

pub enum ExternalEffectRecovery {
    Compensate,
    ForwardRecover,
    IsolateAndRepair,
}
```

Rules:

- Repositories MUST be obtained from the `UnitOfWork`, so they share the same
  transaction. The project defines its concrete repository surface; the shared
  contract fixes that the unit of work owns repositories, outbox, and optional
  idempotency.
- Outbox intent is written in the same transaction as the business mutation.
- Publication happens after commit. The relay retries, deduplicates by
  `event_id`, and records terminal failures.
- Irreversible external effects use `ForwardRecover` or `IsolateAndRepair`;
  forced compensation is not required for effects that cannot be undone.
- A crash after commit but before publication leaves the outbox record for the
  relay; no event is lost.

---

## 8. Wire Envelope and Protocol Bindings

The **semantic envelope** is shared. Its protocol representation is binding-
specific; it is not required to be JSON bytes on every wire.

```rust
pub struct WireContext {
    pub request_id: Option<RequestId>,
    pub deadline_unix_ns: Option<i64>,
    pub idempotency_key: Option<IdempotencyKey>,
    pub trace_id: Option<TraceId>,
}

impl WireContext {
    /// Merge body context and header context. A field present in both with
    /// different values is a conflict, not an override.
    pub fn merge(self, other: WireContext) -> Result<Self, ContractError>;
}

pub struct SemanticRequest {
    pub context: WireContext,
    pub request: serde_json::Value,
}

pub struct SemanticReply {
    pub request_id: RequestId,
    pub outcome: SemanticOutcome,
}

pub enum SemanticOutcome {
    Result(serde_json::Value),
    Error(OperationErrorBody),
}

impl SemanticReply {
    pub fn from_result(result: OperationResultBody) -> Self;
}
```

### 8.1 Protobuf context

The gRPC binding uses typed messages, but the semantic context fields and their
field numbers are fixed:

```proto
message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}
```

### 8.1 Bindings

| Interface | Request binding | Reply binding |
|---|---|---|
| REST | JSON `{context?, request}` | JSON `{request_id, result}` or `{request_id, error}` |
| WebSocket | `{type:"request", request_id, operation_id, payload, context?}` | `{type:"response", request_id, result|error}` |
| CLI | typed arguments converted to the operation request | JSON/JSONL with `request_id` |
| gRPC | typed message with `Context` and typed request fields | typed message with `request_id` and `oneof result/error` |
| MCP | tool input plus context | tool result plus `request_id` |
| A2A | task/message mapped to the operation request | task artifact plus `request_id` |

Every binding returns the `request_id` in a place the client can read. REST
aliases use the same semantic envelope; an alias is path/method sugar, not a
different wire shape.

The protobuf schema may use typed messages. It MUST carry the semantic
`Context` fields and the `request_id` on the reply. The universal "JSON bytes in
protobuf" rule from the previous version is withdrawn.

---

## 9. Interface Contract

```rust
pub const INTERFACE_REST: InterfaceId = InterfaceId::new("rest");
pub const INTERFACE_WEBSOCKET: InterfaceId = InterfaceId::new("websocket");
pub const INTERFACE_CLI: InterfaceId = InterfaceId::new("cli");
pub const INTERFACE_GRPC: InterfaceId = InterfaceId::new("grpc");
pub const INTERFACE_MCP: InterfaceId = InterfaceId::new("mcp");
pub const INTERFACE_A2A: InterfaceId = InterfaceId::new("a2a");

pub trait InterfaceDriver: Send + Sync {
    fn id(&self) -> InterfaceId;
    fn audience(&self) -> Audience;
}

pub enum ProtocolError {
    Unauthenticated,
    Forbidden,
    Malformed(String),
    Transport(String),
    Protocol(String),
    Internal(String),
}
```

Adapters authorize **protocol-owned resources** (WebSocket subscriptions, A2A
tasks, MCP sessions) and MUST NOT authorize business resources; business
authorization belongs to the operation. This distinction is explicit.

---

## 10. Conformance Harness

```rust
pub struct Case {
    pub name: &'static str,
    pub operation: OperationId,
    pub authentication: AuthCase,
    pub principal: Option<TestPrincipal>,
    pub wire: WireContext,
    pub request: serde_json::Value,
    pub stream: Option<StreamScript>,
    pub fixture: FixtureId,
    pub expected: Expected,
    pub expected_state: Option<StateExpectation>,
    pub expected_error_code: Option<ErrorCode>,
}

pub enum AuthCase {
    Valid,
    Missing,
    Malformed,
    WrongAudience,
    Expired,
    Revoked,
    WrongTokenType,
    NoScope,
}

pub struct TestPrincipal {
    pub subject: SubjectId,
    pub tenant: Option<TenantId>,
    pub scopes: ScopeSet,
    pub audience: Audience,
    pub actor: Option<ActorId>,
    pub on_behalf_of: Option<SubjectId>,
}

pub enum Expected {
    Success(ValueMatcher),
    Error { category: ErrorCategory, retryable: bool },
}

pub enum ValueMatcher {
    Exact(serde_json::Value),
    Subset(serde_json::Value),
    Any,
    Regex(String),
}

pub enum StreamScript {
    Server { items: Vec<serde_json::Value>, cancel_after: Option<usize> },
    Client { items: Vec<serde_json::Value>, eof: bool, cancel_after: Option<usize> },
    Bidi { items: Vec<serde_json::Value>, cancel_after: Option<usize> },
}

pub struct InvocationOutcome {
    pub result: Option<serde_json::Value>,
    pub error: Option<OperationErrorBody>,
    pub state: Option<serde_json::Value>,
    pub events: Vec<DomainEvent>,
    pub stream: Vec<StreamEvent>,
}

pub trait ConformanceDriver: Send + Sync {
    fn id(&self) -> InterfaceId;
    fn invoke(&self, case: &Case) -> Result<InvocationOutcome, ProtocolError>;
}

pub fn run_matrix(
    drivers: &[Box<dyn ConformanceDriver>],
    cases: &[Case],
) -> ConformanceReport;
```

`FixtureId` identifies a deterministic fixture with setup and reset. `Case`
includes state expectations, authentication-material expectations, and stream
scripts. The harness compares `OperationErrorBody.code` as well as category and
retryability.

The harness has an **independent oracle**: expected results are derived from the
operation specification, not from one interface's output. A cross-interface
match alone is insufficient.

Out-of-process drivers are required for TLS termination, real WebSocket
upgrade, CLI process/signal/file-permission boundaries, and any protocol
behavior that cannot be exercised in-process.

The compile-fail test is supplemented by a public-API audit: the trusted
constructor is not reachable from adapter crates, and the allowed call sites are
listed.

---

## 11. Rule Registry

Every rule ID is defined exactly once in Part III.15. Part II contains the
top-level rules and the common interface rules; Part III.6–III.12 contain the
detailed interface and conformance rules with their canonical IDs. Duplicate ID
assignments are forbidden.

The registry records, for each rule:

- ID, class (C/G/O/P), profile, statement, parent rule, and verification.

Part II's rule tables may omit the class column because the registry is the
authoritative source.

---

## 12. Versioning

A single `spec_version` covers the rules, these contracts, the generator, and
the conformance kit. Protocol SDK versions are recorded separately.

| Change | Version |
|---|---|
| New operation, scope, error code, auth method, interface constant | Minor |
| New default method on an extension trait | Minor |
| New required field in a context, case, or envelope | Major |
| Changed token validation order or required claims | Major |
| Changed error category table | Major |
| Removed or renamed a type, field, or trait method | Major |

A project pins `spec_version` in `RULES-PROFILE.toml`. The generator and the
conformance kit must report the same version; a mismatch fails startup.

---

## 13. What This Document Deliberately Does Not Define

- The set of operations, scopes, error codes, or domains.
- The storage engine, schema, or query strategy.
- The domain model or business invariants.
- The choice of cryptography library, HTTP server, or protocol SDK.
- The deployment topology.
- The UI.

Projects fill these in. The contracts above are the seams through which they
plug in.

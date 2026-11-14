---
type: "Section"
title: "5.6 Dispatcher"
description: "The dispatcher belongs to `operation-contract`, not to a project crate. This is"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-6-dispatcher"
    title: "5.6 Dispatcher"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-6-dispatcher"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2148-2148"
---
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


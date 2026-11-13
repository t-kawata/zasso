---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-6-dispatcher/1/d6e91143806c
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d6e91143806c555c155a6f8489121eccc586df618fb6d8677a7fecabb422d423
source: sources/10-CONTRACTS.md
---
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

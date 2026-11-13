---
type: CodeBlock
id: codeblock/10-shared-contracts-4-invocation-contexts/1/34dda59668e5
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 34dda59668e57ba16d414d4bf7b941157fcf8a9d67b274f2310cdf1e6d0e69f1
source: sources/10-CONTRACTS.md
---
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

---
type: "Section"
title: "4. Invocation Contexts"
description: "Authentication requirement is separate from scope. An operation is either"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/4-invocation-contexts"
    title: "4. Invocation Contexts"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/4-invocation-contexts"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1785-1785"
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


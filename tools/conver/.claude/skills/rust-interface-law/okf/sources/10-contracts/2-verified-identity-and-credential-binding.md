---
type: "Section"
title: "2. Verified Identity and Credential Binding"
description: "The verifier returns an opaque identity that carries **what was verified, where,"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-2-verified-identity-and-credential-binding"
    title: "2. Verified Identity and Credential Binding"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "152-255"
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


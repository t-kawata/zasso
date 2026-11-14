---
type: "Section"
title: "2. Verified Identity and Credential Binding"
description: "The verifier returns an opaque identity that carries **what was verified, where,"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/2-verified-identity-and-credential-binding"
    title: "2. Verified Identity and Credential Binding"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/2-verified-identity-and-credential-binding"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1572-1572"
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


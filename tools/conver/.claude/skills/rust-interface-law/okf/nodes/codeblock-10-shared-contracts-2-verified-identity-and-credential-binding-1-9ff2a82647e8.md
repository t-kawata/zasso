---
type: CodeBlock
id: codeblock/10-shared-contracts-2-verified-identity-and-credential-binding/1/9ff2a82647e8
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9ff2a82647e8e8fc2eee1d20225ae5a9b25a1ce12e33b8245897e7dba950e5b0
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
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

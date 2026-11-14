---
type: "Section"
title: "6. Login and Local Identity"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/6-login-and-local-identity"
    title: "6. Login and Local Identity"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/6-login-and-local-identity"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3653-3653"
---
## 6. Login and Local Identity

```rust
pub struct LoginService {
    verifiers: std::collections::BTreeMap<AuthMethod, std::sync::Arc<dyn ErasedCredentialVerifier>>,
    issuer: std::sync::Arc<dyn TokenIssuer>,
}

impl LoginService {
    pub async fn login(
        &self,
        method: AuthMethod,
        credential: serde_json::Value,
        audience: Audience,
    ) -> Result<TokenIssueResponse, AuthenticationError>;
}
```

`auth.token.issue` is an `AnonymousOperation` in `identity-operation`. It is
registered by the project operation crate.

For local CLI execution, the identity is established without an HTTP token:

```rust
pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &AuthenticatedUser,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}
```

The `LocalCredentialVerifier` returns `AuthenticatedUser`; the
`LocalIdentityIssuer` converts it into a `VerifiedIdentity` with a CLI binding.
There is no implicit administrator principal.

---

## 7. Refresh Tokens and Sessions


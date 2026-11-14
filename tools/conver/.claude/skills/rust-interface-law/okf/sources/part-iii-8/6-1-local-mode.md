---
type: "Section"
title: "6.1 Local mode"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-8/6-1-local-mode"
    title: "6.1 Local mode"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-8/6-1-local-mode"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4583-4583"
---
### 6.1 Local mode

```rust
pub trait LocalCredentialVerifier: Send + Sync {
    fn verify(
        &self,
        principal: identity_core::SubjectId,
        credential: &str,
    ) -> Result<identity_core::AuthenticatedUser, identity_core::AuthenticationError>;
}

pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &identity_core::AuthenticatedUser,
        audience: identity_core::Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<identity_core::VerifiedIdentity>, identity_core::AuthenticationError>;
}
```

```text
--local
--principal <uuid>
--credential-file <path>     # local credential, 0600
--audience <interface>       # defaults to "cli"
```

Local mode:

1. reads the local credential from a file, stdin, or TTY;
2. verifies it through `LocalCredentialVerifier`;
3. establishes a `VerifiedIdentity` through `LocalIdentityIssuer`
   (the CLI binding, not a REST or WebSocket binding);
4. calls `Dispatcher::execute_verified`.

There is no implicit administrator. The local credential must be provisioned
explicitly. A missing or invalid credential is exit code 3.

### 6.2 Remote mode


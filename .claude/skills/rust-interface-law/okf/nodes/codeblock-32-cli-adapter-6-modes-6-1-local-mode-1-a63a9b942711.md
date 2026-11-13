---
type: CodeBlock
id: codeblock/32-cli-adapter-6-modes-6-1-local-mode/1/a63a9b942711
phase: adapter
delivery: must
applies_to: cli
requires: []
references: []
content_sha256: a63a9b942711ef3753096dde8fffe903b8b1802abe38019859e16b5c94a261e6
source: sources/32-CLI.md
---
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

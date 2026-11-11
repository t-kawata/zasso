---
type: CodeBlock
id: codeblock/22-identity-crates-6-login-and-local-identity/2/a7ad22623c76
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a7ad22623c76b1f7ef6260715b24b5ca75d3f6de8409a71a8847ff40e872337f
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
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

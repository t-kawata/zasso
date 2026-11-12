---
type: CodeBlock
id: codeblock/22-identity-crates-6-login-and-local-identity/1/484caa0be88d
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 484caa0be88d168fa43cec4565787b6ed927a40e4b487cfedb46b155dbf95e4d
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
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

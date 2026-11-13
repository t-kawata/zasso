---
type: CodeBlock
id: codeblock/10-shared-contracts-3-authentication-contracts/2/2339dfb1eb1f
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2339dfb1eb1fe935e60396091e4b8c7a310237e740e10207a2ad14924d762f24
source: sources/10-CONTRACTS.md
---
```rust
pub trait CredentialVerifier: Send + Sync {
    type Credential: Send;
    fn verify(&self, credential: Self::Credential)
        -> Result<AuthenticatedUser, AuthenticationError>;
}

pub trait ErasedCredentialVerifier: Send + Sync {
    fn verify_json(
        &self,
        credential: serde_json::Value,
    ) -> Result<AuthenticatedUser, AuthenticationError>;
}
```

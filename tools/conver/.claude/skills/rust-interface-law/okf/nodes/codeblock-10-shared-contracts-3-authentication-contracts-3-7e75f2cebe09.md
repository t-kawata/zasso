---
type: CodeBlock
id: codeblock/10-shared-contracts-3-authentication-contracts/3/7e75f2cebe09
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7e75f2cebe09cfbb1376c9f30fb96aecc923a8fe7600189baf97b1cf9b2088eb
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```rust
pub trait SsoProvider: Send + Sync {
    type Callback: Send;
    fn authorization_url(&self, state: &str, nonce: &str) -> String;
    fn exchange(&self, callback: Self::Callback)
        -> Result<ExternalIdentity, AuthenticationError>;
}

pub struct ExternalIdentity {
    pub issuer: String,
    pub subject: String,
    pub claims: serde_json::Value,
}

pub trait ExternalIdentityRepository: Send + Sync {
    fn find(
        &self,
        issuer: &str,
        subject: &str,
    ) -> Result<Option<SubjectId>, AuthenticationError>;

    fn link(
        &self,
        subject: SubjectId,
        issuer: &str,
        external_subject: &str,
    ) -> Result<(), AuthenticationError>;
}
```

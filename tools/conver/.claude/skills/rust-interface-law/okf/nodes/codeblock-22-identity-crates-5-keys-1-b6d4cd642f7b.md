---
type: CodeBlock
id: codeblock/22-identity-crates-5-keys/1/b6d4cd642f7b
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b6d4cd642f7ba34f679362d8c1c5d933f9fb7f094d290c2ca598c9e39c3afd37
source: sources/22-IDENTITY.md
---
```rust
pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub trait SigningKeyStore: Send + Sync {
    fn signing_key(&self, kid: &str) -> Result<SigningKey, AuthenticationError>;
}
```

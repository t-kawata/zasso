---
type: "Section"
title: "5. Keys"
description: "```rust"
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "22-identity-5-keys"
    title: "5. Keys"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/22-IDENTITY.md"
x-source-span: "121-141"
---
## 5. Keys

```rust
pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub trait SigningKeyStore: Send + Sync {
    fn signing_key(&self, kid: &str) -> Result<SigningKey, AuthenticationError>;
}
```

- Multiple active public keys are required for rotation.
- Private keys never leave `identity-core`.
- Key material is validated at startup; invalid keys fail startup.
- JWKS refresh uses a fixed URL and a fixed policy.
- Fail-closed on unknown `kid`, unsupported algorithm, or key parse failure.

---


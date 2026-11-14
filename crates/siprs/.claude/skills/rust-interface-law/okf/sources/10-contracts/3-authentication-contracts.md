---
type: "Section"
title: "3. Authentication Contracts"
description: "```rust"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-3-authentication-contracts"
    title: "3. Authentication Contracts"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "256-364"
---
## 3. Authentication Contracts

```rust
pub trait AccessTokenVerifier: Send + Sync {
    fn verify(
        &self,
        token: &str,
        audience: &Audience,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}

pub trait TokenIssuer: Send + Sync {
    fn issue(
        &self,
        user: &AuthenticatedUser,
        scopes: &ScopeSet,
        audience: &Audience,
    ) -> Result<TokenPair, AuthenticationError>;
}

pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &AuthenticatedUser,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}

pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub struct TokenPair {
    pub access_token: secrecy::SecretString,
    pub refresh_token: Option<secrecy::SecretString>,
    pub expires_in: std::time::Duration,
}

pub enum AuthenticationError {
    Missing,
    Malformed,
    UnsupportedAlgorithm,
    InvalidSignature,
    Expired,
    NotYetValid,
    WrongIssuer,
    WrongAudience,
    WrongTokenType,
    UnknownKey,
    Revoked,
    VersionMismatch,
    DelegationInvalid,
    Provider(String),
}
```

`CredentialVerifier` has a typed API and an erased API for `dyn` use:

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

`SsoProvider` is the open extension point:

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

---


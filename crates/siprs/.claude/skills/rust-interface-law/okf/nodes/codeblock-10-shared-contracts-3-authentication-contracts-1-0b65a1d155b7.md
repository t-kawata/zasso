---
type: CodeBlock
id: codeblock/10-shared-contracts-3-authentication-contracts/1/0b65a1d155b7
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0b65a1d155b79a1359264816128385eae257034aa540c8019fb419eeeeae6893
source: sources/10-CONTRACTS.md
---
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

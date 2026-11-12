---
type: CodeBlock
id: codeblock/22-identity-crates-4-token-profile-4-2-claims/1/998f1aa2c67e
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 998f1aa2c67e11f711f81ffe73d2c9536ef0cf2f0d704b9e6d3c87a792c236d4
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
```rust
pub struct AccessClaims {
    pub iss: String,
    pub sub: SubjectId,
    pub aud: Audience,
    pub exp: i64,
    pub iat: i64,
    pub nbf: Option<i64>,
    pub jti: String,
    pub ver: u64,
    pub tenant: Option<TenantId>,
    pub scope: Vec<Scope>,
    pub act: Option<SubjectId>,
    pub on_behalf_of: Option<SubjectId>,
}
```

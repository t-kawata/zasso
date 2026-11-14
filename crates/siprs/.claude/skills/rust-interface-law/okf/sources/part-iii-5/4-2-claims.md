---
type: "Section"
title: "4.2 Claims"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/4-2-claims"
    title: "4.2 Claims"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/4-2-claims"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3599-3599"
---
### 4.2 Claims

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

`AccessClaims` is not part of the public deserialization surface; only the
verifier constructs it.

### 4.3 Delegation


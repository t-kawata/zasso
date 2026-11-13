---
type: "Section"
title: "4. Token Profile"
description: "| Item | Value |"
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "22-identity-4-token-profile"
    title: "4. Token Profile"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/22-IDENTITY.md"
x-source-span: "53-120"
---
## 4. Token Profile

| Item | Value |
|---|---|
| Format | JWS compact. JWE is not used. |
| `typ` | `at+jwt` for access tokens; `id+jwt` for internal ID tokens. |
| `alg` | `EdDSA` default; `ES256` allowed. `none` and HS* rejected except `local-only`. |
| `kid` | Required. |
| Required claims | `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, `ver`. |
| Optional claims | `scope`, `nbf`, `tenant`, `act`, `on_behalf_of`. |
| `sub` | Internal `SubjectId`. Never an email or provider ID. |
| `aud` | One interface or resource. |
| `ver` | User token version; compared after signature validation. |
| Access TTL | 900 seconds (configurable 300–3600). |
| Leeway | 30 seconds (configurable 0–60). |
| Key URLs | `jku`/`x5u` never followed. JWKS URL fixed by configuration. |

### 4.1 Validation order

```text
alg allowlist
  → signature
  → iss
  → aud
  → exp / nbf
  → typ
  → sub
  → tenant / delegation
  → ver (token version)
  → jti revocation
```

A failure at any stage returns `AuthenticationError`. The interface maps it to
401; details are logged, never returned.

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

`sub` is the delegated subject, `act` is the actor. Validation MUST ensure:

- the actor is authorized to act for the subject;
- delegated scopes are a subset of both the actor's and the subject's scopes;
- `on_behalf_of` is explicit and is not inferred from `sub`;
- the `VerifiedIdentity` preserves `actor` and `on_behalf_of` for audit.

---


---
type: "Section"
title: "5.2 Authentication contracts"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/5-2-authentication-contracts"
    title: "5.2 Authentication contracts"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/5-2-authentication-contracts"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "711-711"
---
### 5.2 Authentication contracts

| ID | Rule | Verification |
|---|---|---|
| AUTH-01 | Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`. | V1 trait; V2 import scan. |
| AUTH-02 | Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path. | V1 trait; V3 test. |
| AUTH-03 | Access tokens MUST be JWS. JWE is not used. | V3 token test. |
| AUTH-04 | The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile. | V2 config check; V3 negative test. |
| AUTH-05 | The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches. | V3 negative tests N-1, N-2, N-3. |
| AUTH-06 | Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `scope` MAY be present. | V3 token test. |
| AUTH-07 | `sub` MUST be the internal `SubjectId`. | V3 token test. |
| AUTH-08 | `aud` MUST identify one interface or resource. Wildcard audiences are forbidden. A token for one interface MUST be rejected by another. | V3 audience-isolation test. |
| AUTH-09 | Access-token lifetime MUST be short and configurable (recommended 5–15 minutes). | V2 config check. |
| AUTH-10 | Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation. | V1 trait; V3 rotation test. |
| AUTH-11 | Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration. | V3 negative test N-11. |
| AUTH-12 | Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `exp`/`nbf` → `typ` → `sub` → tenant/delegation → `ver` → `jti`. | V3 instrumented test. |
| AUTH-13 | Access tokens, ID tokens, and other token types MUST be mutually exclusive by `typ`, required claims, key, and audience. An external ID token MUST NOT be accepted as an access token. | V3 negative test N-9. |
| AUTH-14 | Revocation MUST be checked after signature validation, using `jti` and/or a user-level token version. Revocation checks MUST NOT replace cryptographic validation. | V3 test. |
| AUTH-15 | Refresh tokens MUST be opaque random values, stored only as hashes, rotated on every use, and revoked as a session family on reuse detection. | V3 test. |
| AUTH-16 | Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned. | V3 response test. |
| AUTH-17 | Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics. | V2 log scan; V3 redaction test. |
| AUTH-18 | Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be a transport-specific router contract in `identity-core`. | V1 type; V2 import scan. |
| AUTH-19 | Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`. | V3 test. |
| AUTH-20 | HS256 is permitted only when all of the following hold: single process, no cross-interface token use, explicit `local-only` profile, key length ≥ 32 bytes. | V2 profile check; V3 negative test. |

**Rationale for AUTH-04.** Asymmetric signatures let the API verify with public
keys only. Moving issuance to another process or an external identity provider
then changes configuration, not the verifier's secret material. HS256 couples
issuer and verifier through a shared secret and does not survive that move.

**Rationale for AUTH-08.** A token leaked from the CLI must not become a REST,
gRPC, or MCP credential. Audience separation is the boundary that makes a leak
local to one interface.

### 5.3 Per-interface authentication

## Rules in this section

- [AUTH-01 — Token verification MUST be expressed as a protocol-independent `AccessTokenVe...](../../rules/c/auth-01.md)
- [AUTH-02 — Token issuance MUST be expressed as a `TokenIssuer` trait; every login method...](../../rules/c/auth-02.md)
- [AUTH-03 — Access tokens MUST be JWS. JWE is not used.](../../rules/c/auth-03.md)
- [AUTH-04 — The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 ...](../../rules/c/auth-04.md)
- [AUTH-05 — The verifier MUST enforce an explicit algorithm allowlist and MUST reject `no...](../../rules/c/auth-05.md)
- [AUTH-06 — Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `...](../../rules/c/auth-06.md)
- [AUTH-07 — `sub` MUST be the internal `SubjectId`.](../../rules/c/auth-07.md)
- [AUTH-08 — `aud` MUST identify one interface or resource. Wildcard audiences are forbidd...](../../rules/c/auth-08.md)
- [AUTH-09 — Access-token lifetime MUST be short and configurable (recommended 5–15 minutes).](../../rules/c/auth-09.md)
- [AUTH-10 — Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multi...](../../rules/c/auth-10.md)
- [AUTH-11 — Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the...](../../rules/c/auth-11.md)
- [AUTH-12 — Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `...](../../rules/c/auth-12.md)
- [AUTH-13 — Access tokens, ID tokens, and other token types MUST be mutually exclusive by...](../../rules/c/auth-13.md)
- [AUTH-14 — Revocation MUST be checked after signature validation, using `jti` and/or a u...](../../rules/c/auth-14.md)
- [AUTH-15 — Refresh tokens MUST be opaque random values, stored only as hashes, rotated o...](../../rules/c/auth-15.md)
- [AUTH-16 — Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reason...](../../rules/c/auth-16.md)
- [AUTH-17 — Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appea...](../../rules/c/auth-17.md)
- [AUTH-18 — Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be...](../../rules/c/auth-18.md)
- [AUTH-19 — Each interface MAY implement its own credential acquisition flow, but all flo...](../../rules/c/auth-19.md)
- [AUTH-20 — HS256 is permitted only when all of the following hold: single process, no cr...](../../rules/c/auth-20.md)


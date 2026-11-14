---
type: "Rule"
title: "AUTH-04 — The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile."
description: "The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "auth-04"
    title: "AUTH-04"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTH-04"
x-source-part: "Part II"
x-source-span: "266-266"
x-verification: "V2 config check; V3 negative test."
---
# AUTH-04

The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V2 config check; V3 negative test. |
| Enforcement | negative-auth suite |

[5.2 Authentication contracts](../../sources/part-ii-1/5-2-authentication-contracts.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [AUTH-01 — Token verification MUST be expressed as a protocol-independent `AccessTokenVe...](auth-01.md)
- [AUTH-02 — Token issuance MUST be expressed as a `TokenIssuer` trait; every login method...](auth-02.md)
- [AUTH-03 — Access tokens MUST be JWS. JWE is not used.](auth-03.md)
- [AUTH-05 — The verifier MUST enforce an explicit algorithm allowlist and MUST reject `no...](auth-05.md)
- [AUTH-06 — Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `...](auth-06.md)
- [AUTH-07 — `sub` MUST be the internal `SubjectId`.](auth-07.md)
- [AUTH-08 — `aud` MUST identify one interface or resource. Wildcard audiences are forbidd...](auth-08.md)
- [AUTH-09 — Access-token lifetime MUST be short and configurable (recommended 5–15 minutes).](auth-09.md)
- [AUTH-10 — Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multi...](auth-10.md)
- [AUTH-11 — Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the...](auth-11.md)
- [AUTH-12 — Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `...](auth-12.md)
- [AUTH-13 — Access tokens, ID tokens, and other token types MUST be mutually exclusive by...](auth-13.md)
- [AUTH-14 — Revocation MUST be checked after signature validation, using `jti` and/or a u...](auth-14.md)
- [AUTH-15 — Refresh tokens MUST be opaque random values, stored only as hashes, rotated o...](auth-15.md)
- [AUTH-16 — Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reason...](auth-16.md)
- [AUTH-17 — Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appea...](auth-17.md)
- [AUTH-18 — Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be...](auth-18.md)
- [AUTH-19 — Each interface MAY implement its own credential acquisition flow, but all flo...](auth-19.md)
- [AUTH-20 — HS256 is permitted only when all of the following hold: single process, no cr...](auth-20.md)

[^auth-04]: sources/EXPERT-REVIEW-PACKAGE.md


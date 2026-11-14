---
type: "Section"
title: "8. SSO"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/8-sso"
    title: "8. SSO"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/8-sso"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3799-3799"
---
## 8. SSO

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IDN-15 | SSO lives in `identity-sso`. | Crate boundary. | Provider set. | V2 dependency check. |
| IDN-16 | OIDC uses Authorization Code + PKCE S256. | Flow. | Provider config. | V3 test. |
| IDN-17 | `state` and `nonce` are per-request, session-bound, single-use. | Lifecycle. | Storage. | V3 test. |
| IDN-18 | Redirect URIs match exactly. | Validation. | Registered list. | V3 test. |
| IDN-19 | External `iss` is validated per provider. | Validation. | Provider map. | V3 test. |
| IDN-20 | External ID tokens are discarded after verification. | Forbidden forwarding. | — | V2 scan; V3 test. |
| IDN-21 | SSO output is `AuthenticatedUser`; `TokenIssuer` issues the internal token. | Flow. | Provider details. | V3 test. |
| IDN-22 | External accounts use `(issuer, subject)`. | Unique tuple. | — | V3 test. |
| IDN-23 | No automatic email-based linking. | Forbidden. | — | V3 test. |
| IDN-24 | Provider secrets come from configuration. | Config source. | — | V2 secret scan. |

---

## 9. Negative Authentication Tests

## Rules in this section

- [IDN-15 — SSO lives in `identity-sso`.](../../rules/o/c/idn-15.md)
- [IDN-16 — OIDC uses Authorization Code + PKCE S256.](../../rules/o/c/idn-16.md)
- [IDN-17 — `state` and `nonce` are per-request, session-bound, single-use.](../../rules/o/c/idn-17.md)
- [IDN-18 — Redirect URIs match exactly.](../../rules/o/c/idn-18.md)
- [IDN-19 — External `iss` is validated per provider.](../../rules/o/c/idn-19.md)
- [IDN-20 — External ID tokens are discarded after verification.](../../rules/o/c/idn-20.md)
- [IDN-21 — SSO output is `AuthenticatedUser`; `TokenIssuer` issues the internal token.](../../rules/o/c/idn-21.md)
- [IDN-22 — External accounts use `(issuer, subject)`.](../../rules/o/c/idn-22.md)
- [IDN-23 — No automatic email-based linking.](../../rules/o/c/idn-23.md)
- [IDN-24 — Provider secrets come from configuration.](../../rules/o/c/idn-24.md)


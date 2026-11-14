---
type: "Section"
title: "8. SSO"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "22-identity-8-sso"
    title: "8. SSO"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/22-IDENTITY.md"
x-source-span: "288-304"
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


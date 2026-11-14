---
type: "Section"
title: "6. SSO Extension"
description: "SSO is optional. When planned, the following contracts are fixed now."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/6-sso-extension"
    title: "6. SSO Extension"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/6-sso-extension"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "763-763"
---
## 6. SSO Extension

SSO is optional. When planned, the following contracts are fixed now.

| ID | Rule | Verification |
|---|---|---|
| SSO-01 | SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`. | V2 dependency check. |
| SSO-02 | OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden. | V3 protocol test. |
| SSO-03 | `state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use. | V3 test. |
| SSO-04 | Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden. | V2 config check; V3 test. |
| SSO-05 | The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks. | V3 test. |
| SSO-06 | The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer. | V2 import scan; V3 test. |
| SSO-07 | SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token. | V1 type; V3 test. |
| SSO-08 | External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs. | V2 schema check; V3 test. |
| SSO-09 | Accounts MUST NOT be linked automatically by email address. Linking requires an explicit, auditable action. | V3 test. |
| SSO-10 | Provider client IDs and secrets MUST come from configuration or environment variables, never source code. | V2 secret scan. |
| SSO-11 | Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged. | V3 regression test; V4 review. |
| SSO-12 | External ID tokens and internal access tokens MUST be mutually rejected by their verification rules. | V3 negative test N-9. |

**Fixed SSO contract:**

```text
external login verified
        ↓
internal SubjectId resolved
        ↓
allowed scopes and audience decided
        ↓
internal access token issued
```

**Rationale for SSO-09.** Email addresses are not a stable cross-provider
identity. Automatic linking by email enables account takeover when a provider
recycles or reassigns an address.

---

## 7. Authorization

## Rules in this section

- [SSO-01 — SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or ...](../../rules/o/c/sso-01.md)
- [SSO-02 — OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC ...](../../rules/o/c/sso-02.md)
- [SSO-03 — `state` MUST be generated per request and bound to the browser session; OIDC ...](../../rules/o/c/sso-03.md)
- [SSO-04 — Redirect URIs MUST be registered by exact match. Wildcards and open redirecto...](../../rules/o/c/sso-04.md)
- [SSO-05 — The external issuer (`iss`) MUST be validated per provider to prevent mix-up ...](../../rules/o/c/sso-05.md)
- [SSO-06 — The external ID token MUST be verified inside `identity-sso` and discarded. I...](../../rules/o/c/sso-06.md)
- [SSO-07 — SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer`...](../../rules/o/c/sso-07.md)
- [SSO-08 — External accounts MUST be stored in `external_identities` with `UNIQUE(issuer...](../../rules/o/c/sso-08.md)
- [SSO-09 — Accounts MUST NOT be linked automatically by email address. Linking requires ...](../../rules/o/c/sso-09.md)
- [SSO-10 — Provider client IDs and secrets MUST come from configuration or environment v...](../../rules/o/c/sso-10.md)
- [SSO-11 — Adding SSO MUST change only: the `identity-sso` crate, authentication adapter...](../../rules/o/c/sso-11.md)
- [SSO-12 — External ID tokens and internal access tokens MUST be mutually rejected by th...](../../rules/o/c/sso-12.md)


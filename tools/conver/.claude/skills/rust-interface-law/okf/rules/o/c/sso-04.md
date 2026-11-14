---
type: "Rule"
title: "SSO-04 — Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden."
description: "Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-04"
    title: "SSO-04"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "auth-sso"
x-enforcement: "negative-auth suite"
x-parent: "SSO"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "O/C"
x-rule-id: "SSO-04"
x-source-part: "Part II"
x-source-span: "387-387"
x-verification: "V2 config check; V3 test."
---
# SSO-04

Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V2 config check; V3 test. |
| Enforcement | negative-auth suite |

[6. SSO Extension](../../../sources/part-ii-1/6-sso-extension.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../../c/arc-01.md)
- [SSO-01 — SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or ...](sso-01.md)
- [SSO-02 — OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC ...](sso-02.md)
- [SSO-03 — `state` MUST be generated per request and bound to the browser session; OIDC ...](sso-03.md)
- [SSO-05 — The external issuer (`iss`) MUST be validated per provider to prevent mix-up ...](sso-05.md)
- [SSO-06 — The external ID token MUST be verified inside `identity-sso` and discarded. I...](sso-06.md)
- [SSO-07 — SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer`...](sso-07.md)
- [SSO-08 — External accounts MUST be stored in `external_identities` with `UNIQUE(issuer...](sso-08.md)
- [SSO-09 — Accounts MUST NOT be linked automatically by email address. Linking requires ...](sso-09.md)
- [SSO-10 — Provider client IDs and secrets MUST come from configuration or environment v...](sso-10.md)
- [SSO-11 — Adding SSO MUST change only: the `identity-sso` crate, authentication adapter...](sso-11.md)
- [SSO-12 — External ID tokens and internal access tokens MUST be mutually rejected by th...](sso-12.md)

[^sso-04]: sources/EXPERT-REVIEW-PACKAGE.md


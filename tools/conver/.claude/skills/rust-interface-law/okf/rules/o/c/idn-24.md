---
type: "Rule"
title: "IDN-24 — Provider secrets come from configuration."
description: "Provider secrets come from configuration."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-24"
    title: "IDN-24"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "auth-jwt"
x-enforcement: "negative-auth suite"
x-parent: "IDN"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "O/C"
x-rule-id: "IDN-24"
x-source-part: "Part III.5"
x-source-span: "301-301"
x-verification: "V2 secret scan."
---
# IDN-24

Provider secrets come from configuration.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V2 secret scan. |
| Enforcement | negative-auth suite |

[8. SSO](../../../sources/part-iii-5/8-sso.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../../c/arc-01.md)
- [IDN-15 — SSO lives in `identity-sso`.](idn-15.md)
- [IDN-16 — OIDC uses Authorization Code + PKCE S256.](idn-16.md)
- [IDN-17 — `state` and `nonce` are per-request, session-bound, single-use.](idn-17.md)
- [IDN-18 — Redirect URIs match exactly.](idn-18.md)
- [IDN-19 — External `iss` is validated per provider.](idn-19.md)
- [IDN-20 — External ID tokens are discarded after verification.](idn-20.md)
- [IDN-21 — SSO output is `AuthenticatedUser`; `TokenIssuer` issues the internal token.](idn-21.md)
- [IDN-22 — External accounts use `(issuer, subject)`.](idn-22.md)
- [IDN-23 — No automatic email-based linking.](idn-23.md)

[^idn-24]: sources/EXPERT-REVIEW-PACKAGE.md


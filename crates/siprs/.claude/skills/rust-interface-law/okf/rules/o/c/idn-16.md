---
type: "Rule"
title: "IDN-16 — OIDC uses Authorization Code + PKCE S256."
description: "OIDC uses Authorization Code + PKCE S256."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-16"
    title: "IDN-16"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "auth-jwt"
x-enforcement: "negative-auth suite"
x-parent: "IDN"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "O/C"
x-rule-id: "IDN-16"
x-source-part: "Part III.5"
x-source-span: "293-293"
x-verification: "V3 test."
---
# IDN-16

OIDC uses Authorization Code + PKCE S256.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[8. SSO](../../../sources/22-identity/8-sso.md)

[^idn-16]: sources/22-IDENTITY.md


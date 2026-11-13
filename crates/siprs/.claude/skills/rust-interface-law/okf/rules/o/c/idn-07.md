---
type: "Rule"
title: "IDN-07 — Refresh tokens are opaque random values, not JWTs."
description: "Refresh tokens are opaque random values, not JWTs."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-07"
    title: "IDN-07"
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
x-rule-id: "IDN-07"
x-source-part: "Part III.5"
x-source-span: "186-186"
x-verification: "V3 test."
---
# IDN-07

Refresh tokens are opaque random values, not JWTs.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[7. Refresh Tokens and Sessions](../../../sources/22-identity/7-refresh-tokens-and-sessions.md)

[^idn-07]: sources/22-IDENTITY.md


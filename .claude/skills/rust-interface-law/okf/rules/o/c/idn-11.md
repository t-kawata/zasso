---
type: "Rule"
title: "IDN-11 — Sessions are independent of the login method."
description: "Sessions are independent of the login method."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-11"
    title: "IDN-11"
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
x-rule-id: "IDN-11"
x-source-part: "Part III.5"
x-source-span: "190-190"
x-verification: "V2 schema check."
---
# IDN-11

Sessions are independent of the login method.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V2 schema check. |
| Enforcement | negative-auth suite |

[7. Refresh Tokens and Sessions](../../../sources/22-identity/7-refresh-tokens-and-sessions.md)

[^idn-11]: sources/22-IDENTITY.md


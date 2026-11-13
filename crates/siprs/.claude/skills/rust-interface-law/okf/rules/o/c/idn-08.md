---
type: "Rule"
title: "IDN-08 — Only a hash is stored."
description: "Only a hash is stored."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-08"
    title: "IDN-08"
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
x-rule-id: "IDN-08"
x-source-part: "Part III.5"
x-source-span: "187-187"
x-verification: "V3 DB test."
---
# IDN-08

Only a hash is stored.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V3 DB test. |
| Enforcement | negative-auth suite |

[7. Refresh Tokens and Sessions](../../../sources/22-identity/7-refresh-tokens-and-sessions.md)

[^idn-08]: sources/22-IDENTITY.md


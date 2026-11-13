---
type: "Rule"
title: "IDN-09 — Every use consumes and rotates the token atomically."
description: "Every use consumes and rotates the token atomically."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-09"
    title: "IDN-09"
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
x-rule-id: "IDN-09"
x-source-part: "Part III.5"
x-source-span: "188-188"
x-verification: "V3 concurrency test."
---
# IDN-09

Every use consumes and rotates the token atomically.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V3 concurrency test. |
| Enforcement | negative-auth suite |

[7. Refresh Tokens and Sessions](../../../sources/22-identity/7-refresh-tokens-and-sessions.md)

[^idn-09]: sources/22-IDENTITY.md


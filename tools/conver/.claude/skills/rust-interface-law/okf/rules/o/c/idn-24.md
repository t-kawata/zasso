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

[8. SSO](../../../sources/22-identity/8-sso.md)

[^idn-24]: sources/22-IDENTITY.md


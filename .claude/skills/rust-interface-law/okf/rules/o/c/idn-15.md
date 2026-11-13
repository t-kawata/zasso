---
type: "Rule"
title: "IDN-15 — SSO lives in `identity-sso`."
description: "SSO lives in `identity-sso`."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-15"
    title: "IDN-15"
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
x-rule-id: "IDN-15"
x-source-part: "Part III.5"
x-source-span: "292-292"
x-verification: "V2 dependency check."
---
# IDN-15

SSO lives in `identity-sso`.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V2 dependency check. |
| Enforcement | negative-auth suite |

[8. SSO](../../../sources/22-identity/8-sso.md)

[^idn-15]: sources/22-IDENTITY.md


---
type: "Rule"
title: "IDN-23 — No automatic email-based linking."
description: "No automatic email-based linking."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-23"
    title: "IDN-23"
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
x-rule-id: "IDN-23"
x-source-part: "Part III.5"
x-source-span: "300-300"
x-verification: "V3 test."
---
# IDN-23

No automatic email-based linking.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[8. SSO](../../../sources/22-identity/8-sso.md)

[^idn-23]: sources/22-IDENTITY.md


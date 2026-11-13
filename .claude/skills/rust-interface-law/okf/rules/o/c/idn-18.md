---
type: "Rule"
title: "IDN-18 — Redirect URIs match exactly."
description: "Redirect URIs match exactly."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-18"
    title: "IDN-18"
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
x-rule-id: "IDN-18"
x-source-part: "Part III.5"
x-source-span: "295-295"
x-verification: "V3 test."
---
# IDN-18

Redirect URIs match exactly.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[8. SSO](../../../sources/22-identity/8-sso.md)

[^idn-18]: sources/22-IDENTITY.md


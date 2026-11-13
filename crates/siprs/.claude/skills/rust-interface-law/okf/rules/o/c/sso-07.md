---
type: "Rule"
title: "SSO-07 — SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token."
description: "SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-07"
    title: "SSO-07"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "auth-sso"
x-enforcement: "negative-auth suite"
x-parent: "SSO"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "O/C"
x-rule-id: "SSO-07"
x-source-part: "Part II"
x-source-span: "390-390"
x-verification: "V1 type; V3 test."
---
# SSO-07

SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V1 type; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-07]: sources/15-RULE-REGISTRY.md


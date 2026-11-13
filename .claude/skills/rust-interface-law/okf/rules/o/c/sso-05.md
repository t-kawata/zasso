---
type: "Rule"
title: "SSO-05 — The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks."
description: "The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-05"
    title: "SSO-05"
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
x-rule-id: "SSO-05"
x-source-part: "Part II"
x-source-span: "388-388"
x-verification: "V3 test."
---
# SSO-05

The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-05]: sources/15-RULE-REGISTRY.md


---
type: "Rule"
title: "SSO-06 — The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer."
description: "The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-06"
    title: "SSO-06"
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
x-rule-id: "SSO-06"
x-source-part: "Part II"
x-source-span: "389-389"
x-verification: "V2 import scan; V3 test."
---
# SSO-06

The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V2 import scan; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-06]: sources/15-RULE-REGISTRY.md


---
type: "Rule"
title: "SSO-03 — `state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use."
description: "`state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-03"
    title: "SSO-03"
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
x-rule-id: "SSO-03"
x-source-part: "Part II"
x-source-span: "386-386"
x-verification: "V3 test."
---
# SSO-03

`state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-03]: sources/15-RULE-REGISTRY.md


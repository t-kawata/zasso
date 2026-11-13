---
type: "Rule"
title: "SSO-02 — OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden."
description: "OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-02"
    title: "SSO-02"
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
x-rule-id: "SSO-02"
x-source-part: "Part II"
x-source-span: "385-385"
x-verification: "V3 protocol test."
---
# SSO-02

OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V3 protocol test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-02]: sources/15-RULE-REGISTRY.md


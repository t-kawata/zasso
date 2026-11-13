---
type: "Rule"
title: "SSO-12 — External ID tokens and internal access tokens MUST be mutually rejected by their verification rules."
description: "External ID tokens and internal access tokens MUST be mutually rejected by their verification rules."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-12"
    title: "SSO-12"
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
x-rule-id: "SSO-12"
x-source-part: "Part II"
x-source-span: "395-395"
x-verification: "V3 negative test N-9."
---
# SSO-12

External ID tokens and internal access tokens MUST be mutually rejected by their verification rules.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V3 negative test N-9. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-12]: sources/15-RULE-REGISTRY.md


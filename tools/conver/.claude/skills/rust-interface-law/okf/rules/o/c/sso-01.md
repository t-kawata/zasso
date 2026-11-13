---
type: "Rule"
title: "SSO-01 — SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`."
description: "SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-01"
    title: "SSO-01"
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
x-rule-id: "SSO-01"
x-source-part: "Part II"
x-source-span: "384-384"
x-verification: "V2 dependency check."
---
# SSO-01

SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V2 dependency check. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-01]: sources/15-RULE-REGISTRY.md


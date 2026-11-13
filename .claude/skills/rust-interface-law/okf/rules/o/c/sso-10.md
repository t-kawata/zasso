---
type: "Rule"
title: "SSO-10 — Provider client IDs and secrets MUST come from configuration or environment variables, never source code."
description: "Provider client IDs and secrets MUST come from configuration or environment variables, never source code."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-10"
    title: "SSO-10"
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
x-rule-id: "SSO-10"
x-source-part: "Part II"
x-source-span: "393-393"
x-verification: "V2 secret scan."
---
# SSO-10

Provider client IDs and secrets MUST come from configuration or environment variables, never source code.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V2 secret scan. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-10]: sources/15-RULE-REGISTRY.md


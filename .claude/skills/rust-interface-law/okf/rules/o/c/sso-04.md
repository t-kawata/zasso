---
type: "Rule"
title: "SSO-04 — Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden."
description: "Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-04"
    title: "SSO-04"
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
x-rule-id: "SSO-04"
x-source-part: "Part II"
x-source-span: "387-387"
x-verification: "V2 config check; V3 test."
---
# SSO-04

Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V2 config check; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-04]: sources/15-RULE-REGISTRY.md


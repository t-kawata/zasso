---
type: "Rule"
title: "SSO-08 — External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs."
description: "External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-08"
    title: "SSO-08"
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
x-rule-id: "SSO-08"
x-source-part: "Part II"
x-source-span: "391-391"
x-verification: "V2 schema check; V3 test."
---
# SSO-08

External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V2 schema check; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-08]: sources/15-RULE-REGISTRY.md


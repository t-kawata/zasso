---
type: "Rule"
title: "SSO-11 — Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged."
description: "Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sso-11"
    title: "SSO-11"
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
x-rule-id: "SSO-11"
x-source-part: "Part II"
x-source-span: "394-394"
x-verification: "V3 regression test; V4 review."
---
# SSO-11

Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-sso |
| Parent | SSO |
| Source part | Part II |
| Verification | V3 regression test; V4 review. |
| Enforcement | negative-auth suite |

[1. Registry](../../../sources/15-rule-registry/1-registry.md)

[^sso-11]: sources/15-RULE-REGISTRY.md


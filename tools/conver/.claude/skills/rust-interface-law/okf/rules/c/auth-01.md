---
type: "Rule"
title: "AUTH-01 — Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`."
description: "Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "auth-01"
    title: "AUTH-01"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTH-01"
x-source-part: "Part II"
x-source-span: "263-263"
x-verification: "V1 trait; V2 import scan."
---
# AUTH-01

Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V1 trait; V2 import scan. |
| Enforcement | negative-auth suite |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^auth-01]: sources/21-OPERATION.md


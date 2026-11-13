---
type: "Rule"
title: "AUTH-02 — Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path."
description: "Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "auth-02"
    title: "AUTH-02"
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
x-rule-id: "AUTH-02"
x-source-part: "Part II"
x-source-span: "264-264"
x-verification: "V1 trait; V3 test."
---
# AUTH-02

Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V1 trait; V3 test. |
| Enforcement | negative-auth suite |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^auth-02]: sources/21-OPERATION.md


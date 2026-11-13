---
type: "Rule"
title: "AUTH-29 — `VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch."
description: "`VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-29"
    title: "AUTH-29"
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
x-rule-id: "AUTH-29"
x-source-part: "Part II"
x-source-span: "87-87"
x-verification: "V1 type; V3 test."
---
# AUTH-29

`VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V1 type; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-29]: sources/15-RULE-REGISTRY.md


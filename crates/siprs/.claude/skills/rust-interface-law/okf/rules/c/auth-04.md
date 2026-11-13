---
type: "Rule"
title: "AUTH-04 — The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile."
description: "The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "auth-04"
    title: "AUTH-04"
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
x-rule-id: "AUTH-04"
x-source-part: "Part II"
x-source-span: "266-266"
x-verification: "V2 config check; V3 negative test."
---
# AUTH-04

The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V2 config check; V3 negative test. |
| Enforcement | negative-auth suite |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^auth-04]: sources/21-OPERATION.md


---
type: "Rule"
title: "OP-AUTH-02 — The authorizer uses the loaded resource, never request IDs alone."
description: "The authorizer uses the loaded resource, never request IDs alone."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-auth-02"
    title: "OP-AUTH-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-AUTH-02"
x-source-part: "Part III.4"
x-source-span: "264-264"
x-verification: "V3 cross-tenant test."
---
# OP-AUTH-02

The authorizer uses the loaded resource, never request IDs alone.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-AUTH |
| Source part | Part III.4 |
| Verification | V3 cross-tenant test. |
| Enforcement | cargo test -p <project>-operation/core |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^op-auth-02]: sources/21-OPERATION.md


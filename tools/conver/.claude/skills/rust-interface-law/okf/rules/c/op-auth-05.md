---
type: "Rule"
title: "OP-AUTH-05 — The same identity and resource produce the same result through every interface."
description: "The same identity and resource produce the same result through every interface."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-auth-05"
    title: "OP-AUTH-05"
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
x-rule-id: "OP-AUTH-05"
x-source-part: "Part III.4"
x-source-span: "267-267"
x-verification: "V3 conformance."
---
# OP-AUTH-05

The same identity and resource produce the same result through every interface.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-AUTH |
| Source part | Part III.4 |
| Verification | V3 conformance. |
| Enforcement | cargo test -p <project>-operation/core |

[7. Authorization](../../sources/21-operation/7-authorization.md)

[^op-auth-05]: sources/21-OPERATION.md


---
type: "Rule"
title: "AUTH-25 — CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights."
description: "CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-25"
    title: "AUTH-25"
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
x-rule-id: "AUTH-25"
x-source-part: "Part II"
x-source-span: "83-83"
x-verification: "V3 test."
---
# AUTH-25

CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-25]: sources/15-RULE-REGISTRY.md


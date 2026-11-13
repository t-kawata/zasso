---
type: "Rule"
title: "CORE-01 — Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt."
description: "Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-01"
    title: "CORE-01"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "CORE"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "CORE-01"
x-source-part: "Part III.3"
x-source-span: "97-97"
x-verification: "V1 types; V4 review."
---
# CORE-01

Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V1 types; V4 review. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-01]: sources/20-CORE.md


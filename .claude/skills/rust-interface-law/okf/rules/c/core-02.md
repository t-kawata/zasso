---
type: "Rule"
title: "CORE-02 — Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`."
description: "Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-02"
    title: "CORE-02"
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
x-rule-id: "CORE-02"
x-source-part: "Part III.3"
x-source-span: "98-98"
x-verification: "V1; V3 transition tests."
---
# CORE-02

Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V1; V3 transition tests. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-02]: sources/20-CORE.md


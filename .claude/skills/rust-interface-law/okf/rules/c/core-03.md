---
type: "Rule"
title: "CORE-03 — Value objects validate on construction."
description: "Value objects validate on construction."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-03"
    title: "CORE-03"
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
x-rule-id: "CORE-03"
x-source-part: "Part III.3"
x-source-span: "99-99"
x-verification: "V3 test."
---
# CORE-03

Value objects validate on construction.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-03]: sources/20-CORE.md


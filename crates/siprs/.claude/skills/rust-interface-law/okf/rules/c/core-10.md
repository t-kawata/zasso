---
type: "Rule"
title: "CORE-10 — Domain events are values; publication happens outside core."
description: "Domain events are values; publication happens outside core."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-10"
    title: "CORE-10"
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
x-rule-id: "CORE-10"
x-source-part: "Part III.3"
x-source-span: "106-106"
x-verification: "V1; V3 test."
---
# CORE-10

Domain events are values; publication happens outside core.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V1; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-10]: sources/20-CORE.md


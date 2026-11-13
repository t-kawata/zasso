---
type: "Rule"
title: "CORE-07 — Domain errors are typed and carry a stable code."
description: "Domain errors are typed and carry a stable code."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-07"
    title: "CORE-07"
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
x-rule-id: "CORE-07"
x-source-part: "Part III.3"
x-source-span: "103-103"
x-verification: "V1; V3 test."
---
# CORE-07

Domain errors are typed and carry a stable code.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V1; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-07]: sources/20-CORE.md


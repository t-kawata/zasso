---
type: "Rule"
title: "CORE-08 — Core does not perform I/O."
description: "Core does not perform I/O."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-08"
    title: "CORE-08"
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
x-rule-id: "CORE-08"
x-source-part: "Part III.3"
x-source-span: "104-104"
x-verification: "V2 import scan."
---
# CORE-08

Core does not perform I/O.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V2 import scan. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-08]: sources/20-CORE.md


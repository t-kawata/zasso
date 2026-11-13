---
type: "Rule"
title: "CORE-04 — IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries."
description: "IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-04"
    title: "CORE-04"
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
x-rule-id: "CORE-04"
x-source-part: "Part III.3"
x-source-span: "100-100"
x-verification: "V1."
---
# CORE-04

IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V1. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-04]: sources/20-CORE.md


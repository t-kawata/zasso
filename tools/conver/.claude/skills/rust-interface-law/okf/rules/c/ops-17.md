---
type: "Rule"
title: "OPS-17 — `ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it."
description: "`ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-17"
    title: "OPS-17"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OPS"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OPS-17"
x-source-part: "Part II"
x-source-span: "359-359"
x-verification: "V1/V2 visibility; V3 test."
---
# OPS-17

`ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V1/V2 visibility; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-17]: sources/15-RULE-REGISTRY.md


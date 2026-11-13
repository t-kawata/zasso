---
type: "Rule"
title: "OPS-06 — No side effect MAY occur before authorization succeeds."
description: "No side effect MAY occur before authorization succeeds."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-06"
    title: "OPS-06"
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
x-rule-id: "OPS-06"
x-source-part: "Part II"
x-source-span: "348-348"
x-verification: "V3 failure-injection test."
---
# OPS-06

No side effect MAY occur before authorization succeeds.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 failure-injection test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-06]: sources/15-RULE-REGISTRY.md


---
type: "Rule"
title: "OPS-16 — Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior."
description: "Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-16"
    title: "OPS-16"
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
x-rule-id: "OPS-16"
x-source-part: "Part II"
x-source-span: "358-358"
x-verification: "V3 rule coverage."
---
# OPS-16

Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 rule coverage. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-16]: sources/15-RULE-REGISTRY.md


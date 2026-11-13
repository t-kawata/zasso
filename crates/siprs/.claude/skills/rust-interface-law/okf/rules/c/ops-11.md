---
type: "Rule"
title: "OPS-11 — Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics."
description: "Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-11"
    title: "OPS-11"
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
x-rule-id: "OPS-11"
x-source-part: "Part II"
x-source-span: "353-353"
x-verification: "V3 streaming test."
---
# OPS-11

Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 streaming test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-11]: sources/15-RULE-REGISTRY.md


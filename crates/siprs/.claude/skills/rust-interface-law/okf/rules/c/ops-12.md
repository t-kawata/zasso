---
type: "Rule"
title: "OPS-12 — One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden."
description: "One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-12"
    title: "OPS-12"
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
x-rule-id: "OPS-12"
x-source-part: "Part II"
x-source-span: "354-354"
x-verification: "V2 import/scan; V4 review."
---
# OPS-12

One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V2 import/scan; V4 review. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-12]: sources/15-RULE-REGISTRY.md


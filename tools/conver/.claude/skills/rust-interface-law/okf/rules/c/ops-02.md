---
type: "Rule"
title: "OPS-02 — The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`."
description: "The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-02"
    title: "OPS-02"
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
x-rule-id: "OPS-02"
x-source-part: "Part II"
x-source-span: "344-344"
x-verification: "V3 schema test."
---
# OPS-02

The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 schema test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-02]: sources/15-RULE-REGISTRY.md


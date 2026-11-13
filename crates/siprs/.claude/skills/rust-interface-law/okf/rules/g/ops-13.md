---
type: "Rule"
title: "OPS-13 — Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`."
description: "Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-13"
    title: "OPS-13"
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
x-rule-class: "G"
x-rule-id: "OPS-13"
x-source-part: "Part II"
x-source-span: "355-355"
x-verification: "V2 import scan."
---
# OPS-13

Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V2 import scan. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-13]: sources/15-RULE-REGISTRY.md


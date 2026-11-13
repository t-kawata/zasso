---
type: "Rule"
title: "ARC-03 — `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK."
description: "`*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-03"
    title: "ARC-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo metadata / check-deps"
x-parent: "ARC"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ARC-03"
x-source-part: "Part II"
x-source-span: "51-51"
x-verification: "V2 dependency and import scan."
---
# ARC-03

`*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V2 dependency and import scan. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-03]: sources/15-RULE-REGISTRY.md


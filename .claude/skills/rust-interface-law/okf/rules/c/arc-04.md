---
type: "Rule"
title: "ARC-04 — An interface crate MUST NOT depend on another interface crate."
description: "An interface crate MUST NOT depend on another interface crate."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-04"
    title: "ARC-04"
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
x-rule-id: "ARC-04"
x-source-part: "Part II"
x-source-span: "52-52"
x-verification: "V2 `cargo metadata` edge check."
---
# ARC-04

An interface crate MUST NOT depend on another interface crate.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V2 `cargo metadata` edge check. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-04]: sources/15-RULE-REGISTRY.md


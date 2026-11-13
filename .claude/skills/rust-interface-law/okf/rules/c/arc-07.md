---
type: "Rule"
title: "ARC-07 — `*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly."
description: "`*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-07"
    title: "ARC-07"
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
x-rule-id: "ARC-07"
x-source-part: "Part II"
x-source-span: "55-55"
x-verification: "V1/V3; review of public traits and tests with fakes."
---
# ARC-07

`*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V1/V3; review of public traits and tests with fakes. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-07]: sources/15-RULE-REGISTRY.md


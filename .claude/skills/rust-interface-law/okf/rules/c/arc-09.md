---
type: "Rule"
title: "ARC-09 — Crate names MUST use the project prefix and the role suffix (`<project-c>-core`, `<project-c>-operation`, `<project-c>-rest`, and so on)."
description: "Crate names MUST use the project prefix and the role suffix (`<project-c>-core`, `<project-c>-operation`, `<project-c>-rest`, and so on)."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-09"
    title: "ARC-09"
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
x-rule-id: "ARC-09"
x-source-part: "Part II"
x-source-span: "57-57"
x-verification: "V4 review; manifest check."
---
# ARC-09

Crate names MUST use the project prefix and the role suffix (`<project-c>-core`, `<project-c>-operation`, `<project-c>-rest`, and so on).

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V4 review; manifest check. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-09]: sources/15-RULE-REGISTRY.md


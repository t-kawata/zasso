---
type: "Rule"
title: "ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles."
description: "Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-01"
    title: "ARC-01"
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
x-requires: [rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ARC-01"
x-source-part: "Part II"
x-source-span: "49-49"
x-verification: "V4 review; crate manifest and module layout."
---
# ARC-01

Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V4 review; crate manifest and module layout. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-01]: sources/15-RULE-REGISTRY.md


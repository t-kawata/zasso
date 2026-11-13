---
type: "Rule"
title: "ARC-10 — Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`."
description: "Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-10"
    title: "ARC-10"
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
x-rule-id: "ARC-10"
x-source-part: "Part II"
x-source-span: "58-58"
x-verification: "V4 review."
---
# ARC-10

Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V4 review. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-10]: sources/15-RULE-REGISTRY.md


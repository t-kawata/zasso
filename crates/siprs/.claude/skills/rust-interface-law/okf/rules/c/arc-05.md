---
type: "Rule"
title: "ARC-05 — `*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`."
description: "`*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-05"
    title: "ARC-05"
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
x-rule-id: "ARC-05"
x-source-part: "Part II"
x-source-span: "53-53"
x-verification: "V2 `cargo metadata` edge check."
---
# ARC-05

`*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V2 `cargo metadata` edge check. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-05]: sources/15-RULE-REGISTRY.md


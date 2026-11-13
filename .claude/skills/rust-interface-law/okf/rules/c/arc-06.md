---
type: "Rule"
title: "ARC-06 — Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together."
description: "Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-06"
    title: "ARC-06"
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
x-rule-id: "ARC-06"
x-source-part: "Part II"
x-source-span: "54-54"
x-verification: "V2 dependency check."
---
# ARC-06

Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V2 dependency check. |
| Enforcement | cargo metadata / check-deps |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^arc-06]: sources/15-RULE-REGISTRY.md


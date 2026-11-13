---
type: "Rule"
title: "OPS-14 — An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden."
description: "An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-14"
    title: "OPS-14"
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
x-rule-id: "OPS-14"
x-source-part: "Part II"
x-source-span: "356-356"
x-verification: "V1 type; V3 test."
---
# OPS-14

An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V1 type; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^ops-14]: sources/15-RULE-REGISTRY.md


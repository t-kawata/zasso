---
type: "Rule"
title: "AUTH-31 — Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set."
description: "Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-31"
    title: "AUTH-31"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTH-31"
x-source-part: "Part II"
x-source-span: "89-89"
x-verification: "V3 test."
---
# AUTH-31

Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-31]: sources/15-RULE-REGISTRY.md


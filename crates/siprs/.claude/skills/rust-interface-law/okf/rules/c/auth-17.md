---
type: "Rule"
title: "AUTH-17 — Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics."
description: "Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-17"
    title: "AUTH-17"
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
x-rule-id: "AUTH-17"
x-source-part: "Part II"
x-source-span: "75-75"
x-verification: "V2 log scan; V3 redaction test."
---
# AUTH-17

Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V2 log scan; V3 redaction test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-17]: sources/15-RULE-REGISTRY.md


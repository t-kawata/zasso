---
type: "Rule"
title: "ERR-03 — Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses."
description: "Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "err-03"
    title: "ERR-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "ERR"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ERR-03"
x-source-part: "Part II"
x-source-span: "227-227"
x-verification: "V2 scan; V3 redaction test."
---
# ERR-03

Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ERR |
| Source part | Part II |
| Verification | V2 scan; V3 redaction test. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^err-03]: sources/15-RULE-REGISTRY.md


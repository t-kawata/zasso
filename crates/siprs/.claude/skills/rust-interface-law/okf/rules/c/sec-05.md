---
type: "Rule"
title: "SEC-05 — Debug output MUST NOT leak request bodies or credentials."
description: "Debug output MUST NOT leak request bodies or credentials."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sec-05"
    title: "SEC-05"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "SEC"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "SEC-05"
x-source-part: "Part II"
x-source-span: "383-383"
x-verification: "V2 scan; V3 test."
---
# SEC-05

Debug output MUST NOT leak request bodies or credentials.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | SEC |
| Source part | Part II |
| Verification | V2 scan; V3 test. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^sec-05]: sources/15-RULE-REGISTRY.md


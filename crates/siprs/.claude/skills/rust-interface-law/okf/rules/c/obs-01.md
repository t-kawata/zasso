---
type: "Rule"
title: "OBS-01 — Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration."
description: "Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "obs-01"
    title: "OBS-01"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "OBS"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OBS-01"
x-source-part: "Part II"
x-source-span: "302-302"
x-verification: "V3 log test."
---
# OBS-01

Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OBS |
| Source part | Part II |
| Verification | V3 log test. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^obs-01]: sources/15-RULE-REGISTRY.md


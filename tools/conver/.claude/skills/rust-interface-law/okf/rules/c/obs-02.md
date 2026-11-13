---
type: "Rule"
title: "OBS-02 — Logs MUST NOT include tokens, secrets, authorization codes, or passwords."
description: "Logs MUST NOT include tokens, secrets, authorization codes, or passwords."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "obs-02"
    title: "OBS-02"
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
x-rule-id: "OBS-02"
x-source-part: "Part II"
x-source-span: "303-303"
x-verification: "V2 scan; V3 test."
---
# OBS-02

Logs MUST NOT include tokens, secrets, authorization codes, or passwords.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OBS |
| Source part | Part II |
| Verification | V2 scan; V3 test. |
| Enforcement | mapping / redaction / audit tests |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^obs-02]: sources/15-RULE-REGISTRY.md


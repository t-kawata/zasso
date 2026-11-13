---
type: "Rule"
title: "AUTH-22 — WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden."
description: "WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-22"
    title: "AUTH-22"
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
x-rule-id: "AUTH-22"
x-source-part: "Part II"
x-source-span: "80-80"
x-verification: "V3 test."
---
# AUTH-22

WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-22]: sources/15-RULE-REGISTRY.md


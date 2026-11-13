---
type: "Rule"
title: "AUTH-26 — MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API."
description: "MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-26"
    title: "AUTH-26"
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
x-rule-id: "AUTH-26"
x-source-part: "Part II"
x-source-span: "84-84"
x-verification: "V3 protocol test."
---
# AUTH-26

MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 protocol test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-26]: sources/15-RULE-REGISTRY.md


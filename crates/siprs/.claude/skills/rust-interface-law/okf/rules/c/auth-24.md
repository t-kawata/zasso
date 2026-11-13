---
type: "Rule"
title: "AUTH-24 — CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history."
description: "CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-24"
    title: "AUTH-24"
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
x-rule-id: "AUTH-24"
x-source-part: "Part II"
x-source-span: "82-82"
x-verification: "V2 argv scan; V3 test."
---
# AUTH-24

CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V2 argv scan; V3 test. |
| Enforcement | negative-auth suite |

[1. Registry](../../sources/15-rule-registry/1-registry.md)

[^auth-24]: sources/15-RULE-REGISTRY.md


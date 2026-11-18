---
type: "Rule"
title: "OP-AUTH-07 — Replay authorization MUST evaluate the current caller. A recorded target identifies the resource being authorized and MUST NOT be treated as evidence that the original executor was permitted."
description: "Replay authorization MUST evaluate the current caller. A recorded target identifies the resource being authorized and MUST NOT be treated as evidence that the original executor was permitted."
sources: 
  - resource: "update/UPDATE001.md"
    id: "op-auth-07"
    title: "OP-AUTH-07"
generated: 
  by: "build-law-skill"
  at: "2026-11-18"
verified: 
  - by: "human:law-review"
    at: "2026-11-18"
status: "stable"
x-applies-to: "all"
x-enforcement: "review"
x-parent: "OP"
x-phase: "operation"
x-requires: [rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-AUTH-07"
x-source-span: "28-28"
x-verification: "V1"
---
# OP-AUTH-07

Replay authorization MUST evaluate the current caller. A recorded target identifies the resource being authorized and MUST NOT be treated as evidence that the original executor was permitted.


---
type: "Rule"
title: "OP-AUTH-06 — `ErasedAuthenticatedOperation` MUST expose `replay_authorize` and delegate to `Operation::replay_authorize` with the typed signature."
description: "`ErasedAuthenticatedOperation` MUST expose `replay_authorize` and delegate to `Operation::replay_authorize` with the typed signature."
sources: 
  - resource: "update/UPDATE001.md"
    id: "op-auth-06"
    title: "OP-AUTH-06"
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
x-rule-id: "OP-AUTH-06"
x-source-span: "17-17"
x-verification: "V1"
---
# OP-AUTH-06

`ErasedAuthenticatedOperation` MUST expose `replay_authorize` and delegate to `Operation::replay_authorize` with the typed signature.


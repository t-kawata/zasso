---
type: "Rule"
title: "OP-TX-07 — A committed same-transaction result and its outbox intent MUST be recoverable after a crash. A rollback MUST leave no business change, completion result, or outbox intent."
description: "A committed same-transaction result and its outbox intent MUST be recoverable after a crash. A rollback MUST leave no business change, completion result, or outbox intent."
sources: 
  - resource: "update/UPDATE001.md"
    id: "op-tx-07"
    title: "OP-TX-07"
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
x-rule-id: "OP-TX-07"
x-source-span: "62-62"
x-verification: "V1"
---
# OP-TX-07

A committed same-transaction result and its outbox intent MUST be recoverable after a crash. A rollback MUST leave no business change, completion result, or outbox intent.


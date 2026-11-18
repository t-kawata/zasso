---
type: "Rule"
title: "OP-IDEM-12 — For `same-transaction`, completion MUST be owned by the unit of work and MUST NOT be performed by a synchronous `ExecutionScope::complete` or `fail` that implicitly calls the asynchronous store. An `is_completed()` post-check alone MUST NOT be treated as proof of atomicity."
description: "For `same-transaction`, completion MUST be owned by the unit of work and MUST NOT be performed by a synchronous `ExecutionScope::complete` or `fail` that implicitly calls the asynchronous store. An `is_completed()` post-check alone MUST NOT be treated as proof of atomicity."
sources: 
  - resource: "update/UPDATE001.md"
    id: "op-idem-12"
    title: "OP-IDEM-12"
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
x-rule-id: "OP-IDEM-12"
x-source-span: "66-66"
x-verification: "V1"
---
# OP-IDEM-12

For `same-transaction`, completion MUST be owned by the unit of work and MUST NOT be performed by a synchronous `ExecutionScope::complete` or `fail` that implicitly calls the asynchronous store. An `is_completed()` post-check alone MUST NOT be treated as proof of atomicity.


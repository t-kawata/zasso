---
type: "Rule"
title: "OPS-19 — On `ClaimOutcome::Replay` the dispatcher MUST call `replay_authorize` and MUST NOT call `prepare_validated` or `execute`; it MUST return the stored result only after authorization succeeds."
description: "On `ClaimOutcome::Replay` the dispatcher MUST call `replay_authorize` and MUST NOT call `prepare_validated` or `execute`; it MUST return the stored result only after authorization succeeds."
sources: 
  - resource: "update/UPDATE001.md"
    id: "ops-19"
    title: "OPS-19"
generated: 
  by: "build-law-skill"
  at: "2026-11-18"
verified: 
  - by: "human:law-review"
    at: "2026-11-18"
status: "stable"
x-applies-to: "all"
x-enforcement: "review"
x-parent: "OPS"
x-phase: "operation"
x-requires: [rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OPS-19"
x-source-span: "27-27"
x-verification: "V1"
---
# OPS-19

On `ClaimOutcome::Replay` the dispatcher MUST call `replay_authorize` and MUST NOT call `prepare_validated` or `execute`; it MUST return the stored result only after authorization succeeds.


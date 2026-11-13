---
type: "Rule"
title: "CONF-48 — Same-transaction completion, business mutation, and outbox intent are atomic; a crash after commit recovers both the result and the event."
description: "Same-transaction completion, business mutation, and outbox intent are atomic; a crash after commit recovers both the result and the event."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-48"
    title: "CONF-48"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "conformance"
x-enforcement: "cargo test -p <project>-conformance"
x-parent: "CONF"
x-phase: "conformance"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "P"
x-rule-id: "CONF-48"
x-source-part: "Part III.12"
x-source-span: "273-273"
x-verification: "V3 crash test."
---
# CONF-48

Same-transaction completion, business mutation, and outbox intent are atomic; a crash after commit recovers both the result and the event.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 crash test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-48]: sources/40-CONFORMANCE.md


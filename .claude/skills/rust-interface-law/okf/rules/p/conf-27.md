---
type: "Rule"
title: "CONF-27 — A crash after business commit but before publication is recovered; the event is not lost."
description: "A crash after business commit but before publication is recovered; the event is not lost."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-27"
    title: "CONF-27"
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
x-rule-id: "CONF-27"
x-source-part: "Part III.12"
x-source-span: "197-197"
x-verification: "V3 crash test."
---
# CONF-27

A crash after business commit but before publication is recovered; the event is not lost.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 crash test. |
| Enforcement | cargo test -p <project>-conformance |

[10. Idempotency, Transactions, and Recovery](../../sources/40-conformance/10-idempotency-transactions-and-recovery.md)

[^conf-27]: sources/40-CONFORMANCE.md


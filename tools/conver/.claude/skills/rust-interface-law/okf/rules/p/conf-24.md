---
type: "Rule"
title: "CONF-24 — Concurrent claims for the same namespace and key produce one execution."
description: "Concurrent claims for the same namespace and key produce one execution."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-24"
    title: "CONF-24"
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
x-rule-id: "CONF-24"
x-source-part: "Part III.12"
x-source-span: "194-194"
x-verification: "V3 concurrency test."
---
# CONF-24

Concurrent claims for the same namespace and key produce one execution.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 concurrency test. |
| Enforcement | cargo test -p <project>-conformance |

[10. Idempotency, Transactions, and Recovery](../../sources/40-conformance/10-idempotency-transactions-and-recovery.md)

[^conf-24]: sources/40-CONFORMANCE.md


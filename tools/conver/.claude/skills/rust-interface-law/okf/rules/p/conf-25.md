---
type: "Rule"
title: "CONF-25 — A replay re-authorizes before returning the stored result."
description: "A replay re-authorizes before returning the stored result."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-25"
    title: "CONF-25"
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
x-rule-id: "CONF-25"
x-source-part: "Part III.12"
x-source-span: "195-195"
x-verification: "V3 test."
---
# CONF-25

A replay re-authorizes before returning the stored result.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[10. Idempotency, Transactions, and Recovery](../../sources/40-conformance/10-idempotency-transactions-and-recovery.md)

[^conf-25]: sources/40-CONFORMANCE.md


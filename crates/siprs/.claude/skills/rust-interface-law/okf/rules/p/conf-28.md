---
type: "Rule"
title: "CONF-28 — Irreversible effects follow the declared recovery policy."
description: "Irreversible effects follow the declared recovery policy."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-28"
    title: "CONF-28"
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
x-rule-id: "CONF-28"
x-source-part: "Part III.12"
x-source-span: "198-198"
x-verification: "V3 test."
---
# CONF-28

Irreversible effects follow the declared recovery policy.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[10. Idempotency, Transactions, and Recovery](../../sources/40-conformance/10-idempotency-transactions-and-recovery.md)

[^conf-28]: sources/40-CONFORMANCE.md


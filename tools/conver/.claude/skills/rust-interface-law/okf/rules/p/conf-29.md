---
type: "Rule"
title: "CONF-29 — No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed."
description: "No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-29"
    title: "CONF-29"
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
x-rule-id: "CONF-29"
x-source-part: "Part III.12"
x-source-span: "199-199"
x-verification: "V2 architecture scan; V3 test."
---
# CONF-29

No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V2 architecture scan; V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[10. Idempotency, Transactions, and Recovery](../../sources/40-conformance/10-idempotency-transactions-and-recovery.md)

[^conf-29]: sources/40-CONFORMANCE.md


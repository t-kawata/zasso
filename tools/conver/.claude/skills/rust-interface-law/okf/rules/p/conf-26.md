---
type: "Rule"
title: "CONF-26 — Same key with a different canonical request returns conflict."
description: "Same key with a different canonical request returns conflict."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-26"
    title: "CONF-26"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "conformance"
x-enforcement: "cargo test -p <project>-conformance"
x-parent: "CONF"
x-phase: "conformance"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "P"
x-rule-id: "CONF-26"
x-source-part: "Part III.12"
x-source-span: "196-196"
x-verification: "V3 test."
---
# CONF-26

Same key with a different canonical request returns conflict.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[10. Idempotency, Transactions, and Recovery](../../sources/part-iii-12/10-idempotency-transactions-and-recovery.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-24 — Concurrent claims for the same namespace and key produce one execution.](conf-24.md)
- [CONF-25 — A replay re-authorizes before returning the stored result.](conf-25.md)
- [CONF-27 — A crash after business commit but before publication is recovered; the event ...](conf-27.md)
- [CONF-28 — Irreversible effects follow the declared recovery policy.](conf-28.md)
- [CONF-29 — No unrelated external API wait occurs inside a database transaction; transact...](conf-29.md)

[^conf-26]: sources/EXPERT-REVIEW-PACKAGE.md


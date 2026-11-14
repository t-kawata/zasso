---
type: "Section"
title: "10. Idempotency, Transactions, and Recovery"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/10-idempotency-transactions-and-recovery"
    title: "10. Idempotency, Transactions, and Recovery"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/10-idempotency-transactions-and-recovery"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5520-5520"
---
## 10. Idempotency, Transactions, and Recovery

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-24 | Concurrent claims for the same namespace and key produce one execution. | Atomicity. | Store. | V3 concurrency test. |
| CONF-25 | A replay re-authorizes before returning the stored result. | Order. | — | V3 test. |
| CONF-26 | Same key with a different canonical request returns conflict. | Conflict. | Canonicalizer. | V3 test. |
| CONF-27 | A crash after business commit but before publication is recovered; the event is not lost. | Outbox recovery. | Backend. | V3 crash test. |
| CONF-28 | Irreversible effects follow the declared recovery policy. | Recovery declaration. | Policy. | V3 test. |
| CONF-29 | No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed. | External-wait ban. | Transaction budget. | V2 architecture scan; V3 test. |

---

## 11. Streaming

## Rules in this section

- [CONF-24 — Concurrent claims for the same namespace and key produce one execution.](../../rules/p/conf-24.md)
- [CONF-25 — A replay re-authorizes before returning the stored result.](../../rules/p/conf-25.md)
- [CONF-26 — Same key with a different canonical request returns conflict.](../../rules/p/conf-26.md)
- [CONF-27 — A crash after business commit but before publication is recovered; the event ...](../../rules/p/conf-27.md)
- [CONF-28 — Irreversible effects follow the declared recovery policy.](../../rules/p/conf-28.md)
- [CONF-29 — No unrelated external API wait occurs inside a database transaction; transact...](../../rules/p/conf-29.md)


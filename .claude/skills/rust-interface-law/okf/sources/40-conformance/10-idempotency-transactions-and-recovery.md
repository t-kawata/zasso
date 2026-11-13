---
type: "Section"
title: "10. Idempotency, Transactions, and Recovery"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-10-idempotency-transactions-and-recovery"
    title: "10. Idempotency, Transactions, and Recovery"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "190-202"
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


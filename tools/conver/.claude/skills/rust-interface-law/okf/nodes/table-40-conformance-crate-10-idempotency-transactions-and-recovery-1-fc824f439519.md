---
type: Table
id: table/40-conformance-crate-10-idempotency-transactions-and-recovery/1/fc824f439519
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: fc824f4395194f5eec407d5a97875e99709f67cb1cd407cd9b1b4fde425ca20f
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-24 | Concurrent claims for the same namespace and key produce one execution. | Atomicity. | Store. | V3 concurrency test. |
| CONF-25 | A replay re-authorizes before returning the stored result. | Order. | — | V3 test. |
| CONF-26 | Same key with a different canonical request returns conflict. | Conflict. | Canonicalizer. | V3 test. |
| CONF-27 | A crash after business commit but before publication is recovered; the event is not lost. | Outbox recovery. | Backend. | V3 crash test. |
| CONF-28 | Irreversible effects follow the declared recovery policy. | Recovery declaration. | Policy. | V3 test. |
| CONF-29 | No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed. | External-wait ban. | Transaction budget. | V2 architecture scan; V3 test. |

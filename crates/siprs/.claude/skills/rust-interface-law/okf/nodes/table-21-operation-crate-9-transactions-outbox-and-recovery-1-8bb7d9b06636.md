---
type: Table
id: table/21-operation-crate-9-transactions-outbox-and-recovery/1/8bb7d9b06636
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 8bb7d9b066365ecee1eedcbb70ebb4d7b2fe3caf02049b2c1c6804e7089ab74b
source: sources/21-OPERATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-TX-01 | Repositories come from the unit of work. | Ownership. | Concrete surface. | V2 scan; V3 test. |
| OP-TX-02 | Outbox intent is written in the same commit as the business mutation. | Atomic boundary. | Outbox implementation. | V3 crash test. |
| OP-TX-03 | Publication happens after commit by a relay. | Order. | Relay implementation. | V3 test. |
| OP-TX-04 | The relay retries and deduplicates by `event_id`. | Retry and dedup. | Backoff. | V3 test. |
| OP-TX-05 | Irreversible effects use forward recovery or isolation, not forced compensation. | Recovery declared. | Per-operation choice. | V3 failure-injection test. |
| OP-TX-06 | No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery. | External-wait ban. | Transaction time budget. | V2 architecture scan; V3 test. |

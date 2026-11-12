---
type: Table
id: table/35-a2a-adapter-11-implementation-contract-11-5-rules/1/cdd0e791bbba
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: cdd0e791bbba0748294aeb56e51b44c1c0095eb25aea3e1d055726faf8061a36
source: docs/archive/IMPLEMENTATION-SPEC/35-A2A.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-25 | A2A send and stream methods MUST use one shared executor and SDK wire framing. | Shared path. | Executor internals. | V3 shared-path probe. |
| A2A-26 | Production A2A task state, execution claims, idempotency records, and event logs MUST survive instance replacement. | Durability. | Store backend. | V3 restart test. |
| A2A-27 | Every task, cancellation, and replay access MUST bind subject and tenant at the persistence boundary. | Owner binding. | Store API. | V3 owner isolation. |
| A2A-28 | A2A `message/send` and `message/stream` MUST share the same operation invocation and terminal semantics. | Dual mode. | Event payload. | V3 dual-mode test. |
| A2A-29 | A2A cancellation, disconnect, and resubscribe MUST be distinct and MUST use durable event cursors. | State separation. | Timing. | V3 cancel/resubscribe. |
| A2A-30 | A2A auth and agent card MUST declare and enforce the configured security scheme and audience. | Security. | Scheme set. | V3 auth/card test. |

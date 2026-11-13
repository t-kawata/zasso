---
type: Table
id: table/40-conformance-crate-5-cases/1/2c7435af7f61
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 2c7435af7f6154bf94183cc737047bacc5a3beb7bd204f35f61a4c727ad8b1fe
source: sources/40-CONFORMANCE.md
---
| Dimension | Obligation |
|---|---|
| Result | Semantic match, not raw JSON equality. |
| Error | Code, category, and retryability. |
| State | Before/after state and side effects. |
| Events | Outbox intent and publication order. |
| Stream | Item order, EOF, error, cancel, backpressure. |
| Authentication | Binding, audience, expiry, revocation, delegation. |
| Idempotency | First execution, replay, conflict, crash recovery. |
| Concurrency | Concurrent claims, concurrent refresh, concurrent mutation. |

---
type: Paragraph
id: paragraph/21-operation-crate-1-purpose/1/82858b7ba5f5
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 82858b7ba5f5102243234a7a936fb6c5b660ac0a486496f17eb038b08bf8fe2a
source: sources/21-OPERATION.md
---
`*-operation` is the only place where business operations are implemented. It
registers authenticated and anonymous operations, implements authorization and
transaction boundaries, and enqueues outbox events. The dispatcher itself is a
shared contract implementation, not a project crate, so that it can construct
authenticated contexts and enforce credential binding.

---
type: Paragraph
id: paragraph/21-operation-crate-10-events/1/3fb2b0bd9824
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 3fb2b0bd9824daa803b8c914429b99851318df674a43a8451cad8f329243bcd7
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,
`occurred_at`, and payload. The handler enqueues it through the unit of work;
the relay publishes it after commit. A publication failure is retried; it never
rolls back a committed business change.

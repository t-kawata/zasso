---
type: "Section"
title: "10. Events"
description: "`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,"
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "21-operation-10-events"
    title: "10. Events"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/21-OPERATION.md"
x-source-span: "327-335"
---
## 10. Events

`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,
`occurred_at`, and payload. The handler enqueues it through the unit of work;
the relay publishes it after commit. A publication failure is retried; it never
rolls back a committed business change.

---


---
type: "Section"
title: "10. Events"
description: "`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/10-events"
    title: "10. Events"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/10-events"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3452-3452"
---
## 10. Events

`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,
`occurred_at`, and payload. The handler enqueues it through the unit of work;
the relay publishes it after commit. A publication failure is retried; it never
rolls back a committed business change.

---

## 11. Errors


---
type: "Section"
title: "5. Cases"
description: "`Case` includes:"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-5-cases"
    title: "5. Cases"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "114-142"
---
## 5. Cases

`Case` includes:

- authentication material (`AuthCase`);
- tenant and delegation (`TestPrincipal`);
- wire context (`request_id`, deadline, idempotency key, trace);
- request payload;
- optional stream script;
- fixture ID;
- expected result or error;
- expected state;
- expected error code.

A case that only compares JSON is insufficient. The required dimensions are:

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

---


---
type: "Section"
title: "5. Cases"
description: "`Case` includes:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/5-cases"
    title: "5. Cases"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/5-cases"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5444-5444"
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

## 6. Fixtures and Determinism


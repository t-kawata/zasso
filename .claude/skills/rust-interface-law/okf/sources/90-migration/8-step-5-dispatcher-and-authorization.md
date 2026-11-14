---
type: "Section"
title: "8. Step 5 — Dispatcher and Authorization"
description: "1. Add `Dispatcher` and `OperationRegistry` to `<project>-operation`."
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-8-step-5-dispatcher-and-authorization"
    title: "8. Step 5 — Dispatcher and Authorization"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "185-197"
---
## 8. Step 5 — Dispatcher and Authorization

1. Add `Dispatcher` and `OperationRegistry` to `<project>-operation`.
2. Route every handler through the dispatcher.
3. Replace handler-level role checks with `Authorizer::require`.
4. Keep adapters as thin as possible; remove business checks from them.
5. Add the bypass test: an adapter cannot invoke a handler directly.

Verification: no handler is reachable without the dispatcher; authorization
tests pass for every operation.

---


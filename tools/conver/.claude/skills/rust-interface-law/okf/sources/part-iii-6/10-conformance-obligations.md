---
type: "Section"
title: "10. Conformance Obligations"
description: "1. Every documented route is served, and every served operation is documented."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/10-conformance-obligations"
    title: "10. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/10-conformance-obligations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4112-4112"
---
## 10. Conformance Obligations

1. Every documented route is served, and every served operation is documented.
2. Bearer-only enforcement; query/path tokens rejected.
3. Audience isolation: a token for another interface is rejected.
4. Error mapping matches the category table for every code.
5. Idempotency key is propagated.
6. CORS/Origin denial for unlisted origins.
7. No business logic: import scan and review.
8. `cargo test -p <project>-rest` and `cargo clippy -p <project>-rest -- -D
   warnings`.
9. The conformance report names `REST-01` through `REST-18`.

---

# PART III.7 — WebSocket Adapter

# 31 — WebSocket Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose


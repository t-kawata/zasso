---
type: "Section"
title: "12. Conformance Obligations"
description: "1. Ticket redemption, single use, expiry, and audience binding."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/12-conformance-obligations"
    title: "12. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/12-conformance-obligations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4441-4441"
---
## 12. Conformance Obligations

1. Ticket redemption, single use, expiry, and audience binding.
2. Ticket in query is rejected.
3. Request/response correlation under concurrency.
4. Per-resource FIFO mutation order.
5. Expiry rejects new operations.
6. Backpressure closes with 1013; size violation with 1009.
7. Disconnect cleanup leaves no connection-owned resources.
8. No direct handler call; dispatcher bypass test.
9. Audience isolation: a REST token cannot upgrade.
10. `cargo test -p <project>-websocket` and `cargo clippy -p
    <project>-websocket -- -D warnings`.
11. The conformance report names `WS-01` through `WS-32`.

---

# PART III.8 — CLI Adapter

# 32 — CLI Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose


---
type: "Section"
title: "17. Conformance Obligations"
description: "1. All matrix cells covered or declared not applicable with a reason."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/17-conformance-obligations"
    title: "17. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/17-conformance-obligations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5669-5669"
---
## 17. Conformance Obligations

1. All matrix cells covered or declared not applicable with a reason.
2. All negative authentication cases pass on every required interface.
3. Binding, expiry, audience, and delegation checks pass.
4. Cross-interface result, error code, state, event, and streaming parity pass.
5. No bypass test fails; public API audit passes.
6. Concurrent idempotency and crash recovery pass.
7. Outbox events are not lost and are not duplicated.
8. TLS, real WebSocket upgrade, and CLI process boundaries pass.
9. Every registry rule has a verdict.
10. SSO regression passes when SSO is implemented.
11. `cargo test -p <project>-conformance` and `cargo clippy -p
    <project>-conformance -- -D warnings`.
12. The report names `CONF-01` through `CONF-65`.

---

# PART III.13 — Project Template

# 50 — Project Template

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

This document defines the workspace every project starts from. It is
profile-driven: a project includes only the crates, files, and generated
outputs for the interfaces it actually implements.

---

## 1. Workspace Layout


---
type: "Section"
title: "17. Conformance Obligations"
description: "1. All matrix cells covered or declared not applicable with a reason."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-17-conformance-obligations"
    title: "17. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "339-354"
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


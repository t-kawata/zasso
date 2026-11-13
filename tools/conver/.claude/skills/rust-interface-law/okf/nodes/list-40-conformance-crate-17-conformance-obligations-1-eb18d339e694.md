---
type: List
id: list/40-conformance-crate-17-conformance-obligations/1/eb18d339e694
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: eb18d339e6948d0302b6c13c44964fa2c5410cfc9cfd9d98af55cf37d99ac79a
source: sources/40-CONFORMANCE.md
---
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

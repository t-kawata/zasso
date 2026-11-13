---
type: List
id: list/22-identity-crates-11-conformance-obligations/1/82736ec71aef
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 82736ec71aef7ae189c1929377226a2f51f76f62bdfa375ac5ad68ab96414c18
source: sources/22-IDENTITY.md
---
1. Negative authentication suite, including the expanded cases in §9.
2. Audience isolation between every pair of interfaces.
3. Binding mismatch rejection (interface, audience, expiry).
4. Local identity establishment without a token and without implicit admin.
5. Atomic refresh rotation, concurrent winner, reuse detection, family revoke.
6. Token version rejection.
7. Delegation validation.
8. SSO regression: existing operations, `VerifiedIdentity`, and business tables
   unchanged.
9. Redaction: no token, password, code, or verifier in logs or errors.
10. `cargo test -p identity-*` and `cargo clippy -p identity-* -- -D warnings`.
11. The conformance report names `IDN-07` through `IDN-24` and the negative
    cases.

---
type: Paragraph
id: paragraph/22-identity-crates-2-crates/2/82a6a652ac2a
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 82a6a652ac2a821cc620b2e0836f766141a704dcf01d76787ef70087f7273cdb
source: sources/22-IDENTITY.md
---
The JWT verifier and session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features. `identity-jwt` is a facade. This makes
`VerifiedIdentity` constructible only inside `identity-core`.

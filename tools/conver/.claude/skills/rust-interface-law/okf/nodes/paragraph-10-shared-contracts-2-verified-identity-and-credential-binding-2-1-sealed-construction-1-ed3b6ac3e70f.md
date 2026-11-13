---
type: Paragraph
id: paragraph/10-shared-contracts-2-verified-identity-and-credential-binding-2-1-sealed-construction/1/ed3b6ac3e70f
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: ed3b6ac3e70f42d29a3860d2e48cf66f538c8088f27be114e9e0a452e91adf71
source: sources/10-CONTRACTS.md
---
`VerifiedIdentity` has private fields and no public constructor. The JWT
verifier and the session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features; `identity-jwt` is a facade. This makes ID-03 a
compile-time property.

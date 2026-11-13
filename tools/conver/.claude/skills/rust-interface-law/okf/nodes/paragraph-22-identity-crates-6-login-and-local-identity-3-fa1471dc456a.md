---
type: Paragraph
id: paragraph/22-identity-crates-6-login-and-local-identity/3/fa1471dc456a
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: fa1471dc456a6cf89f05aea28a9550961c9019c37b97da2330196a571884f9df
source: sources/22-IDENTITY.md
---
The `LocalCredentialVerifier` returns `AuthenticatedUser`; the
`LocalIdentityIssuer` converts it into a `VerifiedIdentity` with a CLI binding.
There is no implicit administrator principal.

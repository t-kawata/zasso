---
type: Paragraph
id: paragraph/10-shared-contracts-2-verified-identity-and-credential-binding-2-1-sealed-construction/2/75553ee5e061
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 75553ee5e061ca0d71932724d5c49405daf75b07fc8d262b10de9f7d50106a35
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
A project that wants a verifier outside `identity-core` must use the declared
static-check alternative (V2: only the trusted verifier crate may call
`from_verified`) and record the exception in `RULES-PROFILE.toml`. The
specification does not treat an import scan as equivalent to compile-time
sealing.

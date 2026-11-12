---
type: Paragraph
id: paragraph/10-shared-contracts-5-operation-contract-5-5-erased-registry/1/cce0030f6f82
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: cce0030f6f82a05e340a775e6b7dc5b82c25b40ec3c2d5143d63cc03d6c88223
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
`ErasedValidated` and `ErasedPrepared` are opaque values owned by the shared
crate. The erased operation that produced a value is its only consumer. It MUST
reject a value whose authentication kind or operation mode does not match the
requested execution. The dispatcher does not inspect or reconstruct either
value.

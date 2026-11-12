---
type: Paragraph
id: paragraph/10-shared-contracts-10-conformance-harness/1/c187a1eba1c4
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c187a1eba1c4f1e2db7bf9deb69889077dafe3298fc2c6cc7fd228e4ba625056
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
`FixtureId` identifies a deterministic fixture with setup and reset. `Case`
includes state expectations, authentication-material expectations, and stream
scripts. The harness compares `OperationErrorBody.code` as well as category and
retryability.

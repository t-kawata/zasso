---
type: Paragraph
id: paragraph/10-shared-contracts-5-operation-contract-5-6-dispatcher/3/eede4a4fb949
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: eede4a4fb949e6020afde9cd0aa9a90b785f7606f31cd47b343d4a5b26b0de26
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
The stream methods are the only public route from an adapter to an operation
stream. The typed operation's stream is converted to the erased
`serde_json::Value` handle by `operation-contract`; the adapter never calls a
handler directly.

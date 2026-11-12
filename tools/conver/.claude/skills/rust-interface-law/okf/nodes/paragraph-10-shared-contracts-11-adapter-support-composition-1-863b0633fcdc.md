---
type: Paragraph
id: paragraph/10-shared-contracts-11-adapter-support-composition/1/863b0633fcdc
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 863b0633fcdc2ef97fc856d6e906da4bf2d2c02b0614f2df5aa8d72ed5507219
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
Adapters MAY share a project-owned adapter-support module that wraps the dispatcher, verifier, wire context, semantic reply, error mapping, and cancellation. The module is a composition seam, not a second contract. It MUST forward to the dispatcher and MUST NOT implement business logic.

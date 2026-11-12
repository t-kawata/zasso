---
type: Paragraph
id: paragraph/47-validation-contract-6-runtime-execution/2/47746af76ecc
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 47746af76ecc8b67c25e24227ea3ca68507e9570958ef974a7c32a1e89f7d892
source: docs/archive/IMPLEMENTATION-SPEC/47-VALIDATION.md
---
Generated validation is stateless input validation. State-dependent
preconditions, resource loading, and ownership authorization belong in
`prepare`, which is not called on replay.

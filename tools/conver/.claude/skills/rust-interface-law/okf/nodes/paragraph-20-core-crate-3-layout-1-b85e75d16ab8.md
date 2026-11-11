---
type: Paragraph
id: paragraph/20-core-crate-3-layout/1/b85e75d16ab8
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: b85e75d16ab857e75a8dc15254c3f2490e07bac30159637e384ad102dd3f2b0c
source: docs/archive/IMPLEMENTATION-SPEC/20-CORE.md
---
The public module layout is fixed. Hand-written files inside `model/`,
`state/`, and `ports/` may be organized differently as long as the public
re-exports and generated boundaries are preserved. The project chooses its own
resource identifier encoding; UUID is not mandatory.

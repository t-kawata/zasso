---
type: Paragraph
id: paragraph/21-operation-crate-12-registry/1/12a88ddf48bd
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 12a88ddf48bdcb45ee82bd6d3711a729cbcaa5c1f18717922cf272ccd5028330
source: sources/21-OPERATION.md
---
`register_all.rs` is generated from the catalog. It registers authenticated and
anonymous operations. Duplicate IDs are rejected at startup. A catalog entry
with no registration fails startup.

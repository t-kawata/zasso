---
type: Paragraph
id: paragraph/90-migration-7-step-4-crate-mapping-7-2-project-a/1/544f7f96a6b4
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 544f7f96a6b47db4ecdc2bc835010895770525d6b519ffa1963b4b52fec69685
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
`<project-a>-foundation` must not hold domain rules or transport types. If it does,
move those pieces to `<project-a>-core` or an adapter.

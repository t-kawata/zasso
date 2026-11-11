---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-1-crates-and-files/1/1f0567823f24
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1f0567823f2479f851b0fedba833f1c08305643297edb370f569ffc25142bcb8
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
`*-docgen` depends on `<project>-operation` so that `inventory` registrations
are linked into the binary. It does not start any server.

---
type: Paragraph
id: paragraph/45-documentation-generation-2-inputs/1/beb62a1ab4d4
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: beb62a1ab4d496229f47e3c026f9e052c045b9a5eb7a88e7f39fab20cea11549
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
The neutral schema registry is produced by `schemars::JsonSchema` (recommended)
or `utoipa::ToSchema` (allowed). The generator reads the resulting JSON Schema,
not the Rust source.

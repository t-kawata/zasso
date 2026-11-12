---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-3-macro-contract-3-6-schema-registration/2/fd18558f07ec
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: fd18558f07ec9054896e15f520d8fc93770de19d26b595718cd13c0c51d88e09
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
If the project uses `utoipa` for REST, it MAY also derive `utoipa::ToSchema`.
The neutral `schemars` registry remains authoritative for all interfaces, and a
gate compares the OpenAPI schema against the neutral schema for the same type.

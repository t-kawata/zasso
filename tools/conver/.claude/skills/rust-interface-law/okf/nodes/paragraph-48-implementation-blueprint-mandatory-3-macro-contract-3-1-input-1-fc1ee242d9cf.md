---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-3-macro-contract-3-1-input/1/fc1ee242d9cf
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: fc1ee242d9cf1081a02365ebe03c76c9c1db21f85843a8d88b721dd035310f96
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
`#[contract::input]` is an attribute macro. `#[rule(...)]` and `#[rule(custom(...))]`
are consumed by it. The struct MUST derive `serde::Deserialize` and
`schemars::JsonSchema`; a missing derive is a compile error caused by the
generated `schemars::schema_for!` call.

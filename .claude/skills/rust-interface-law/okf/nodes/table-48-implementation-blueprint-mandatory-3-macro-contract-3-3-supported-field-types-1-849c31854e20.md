---
type: Table
id: table/48-implementation-blueprint-mandatory-3-macro-contract-3-3-supported-field-types/1/849c31854e20
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 849c31854e20c1c1f9f0019edc0e0374e48da9d3e7f64959b3b93791acc8fcbf
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
| Rust type | Allowed rules |
|---|---|
| `String`, `&str`, `Cow<'_, str>` | `length`, `pattern`, `enum`, `required` |
| `u8`..`u64`, `i8`..`i64`, `f32`, `f64` | `range`, `enum`, `required` |
| `Vec<T>` | `items`, `required` |
| `Option<T>` | inner rules with `inner(...)`; `required` applies to the option itself |
| other types | only `custom`, or an explicit `unsupported_type` compile error |

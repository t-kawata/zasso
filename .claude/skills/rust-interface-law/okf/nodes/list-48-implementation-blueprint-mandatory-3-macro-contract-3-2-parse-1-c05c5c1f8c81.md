---
type: List
id: list/48-implementation-blueprint-mandatory-3-macro-contract-3-2-parse/1/c05c5c1f8c81
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c05c5c1f8c815555ab7dd81cfafd2572c0809599f1667b070a09420d1d872a82
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
1. Parse `syn::ItemStruct`.
2. For each field, read `#[rule(...)]`.
3. Reject a rule on an unsupported type.
4. For a custom rule, verify every name in `fields` exists on the struct.
5. Validate that `code` is a non-empty string literal.
6. Validate that `description` is non-empty and English-only for custom rules.

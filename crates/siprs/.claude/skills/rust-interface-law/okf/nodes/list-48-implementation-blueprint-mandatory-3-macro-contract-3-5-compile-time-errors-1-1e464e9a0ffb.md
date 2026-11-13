---
type: List
id: list/48-implementation-blueprint-mandatory-3-macro-contract-3-5-compile-time-errors/1/1e464e9a0ffb
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1e464e9a0ffb9b68984f2caa22c50a7c520551cd5ffef0d06b1b3fd8baa47d2b
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
- unknown rule name;
- rule applied to an incompatible field type;
- missing or empty `code`;
- custom rule without `id`, `check`, `fields`, `description`, or `code`;
- custom rule naming a field that does not exist;
- conditional rule without `when` and an English description;
- non-English `description`;
- malformed literal (non-numeric range, invalid regex);
- duplicate rule kind on the same field.

---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-3-macro-contract-3-6-schema-registration/1/4557253af31f
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 4557253af31f0b365da58a6e405dea4941ab41fd7e0b7804797f6ba5e75c786b
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
The macro emits `schemars::schema_for!(Type)` through the inventory
registration. The docgen dump calls the function pointer; the schema is a
normal `schemars::Schema`.

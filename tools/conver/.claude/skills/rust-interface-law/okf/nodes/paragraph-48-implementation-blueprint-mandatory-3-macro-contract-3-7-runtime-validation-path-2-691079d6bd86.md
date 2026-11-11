---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-3-macro-contract-3-7-runtime-validation-path/2/691079d6bd86
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 691079d6bd86c10668f9142e31b9791f643898ae83c4da4d3ab16b3833d7a9b7
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
The dispatcher calls `validate_json` before the idempotency claim, for both the
replay and new branches:

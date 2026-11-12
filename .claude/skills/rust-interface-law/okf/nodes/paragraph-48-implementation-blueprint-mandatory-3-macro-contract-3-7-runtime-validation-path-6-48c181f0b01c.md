---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-3-macro-contract-3-7-runtime-validation-path/6/48c181f0b01c
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 48c181f0b01cd41aceae616e2bce9c58f492a3f352855a7755b44557c4990564
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
No adapter calls `prepare`, `validate_json`, or `prepare_validated` directly;
all adapters go through the dispatcher.

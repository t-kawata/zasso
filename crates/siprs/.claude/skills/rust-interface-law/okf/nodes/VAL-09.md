---
type: Rule
id: VAL-09
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 32f5c3123f3522fae9bbc2951fde073b825225a932a7877a52bc055725d21cb0
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `VAL-09` | C | all | VAL | Part III.17 | A custom rule without a description fails compilation. | V3 compile-fail test. | cargo test + docgen --check validation |

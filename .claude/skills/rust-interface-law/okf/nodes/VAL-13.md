---
type: Rule
id: VAL-13
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: cf0fe73f6e283a27418ba5aa16d569e26cf53a5cc17e6432816caaf1a051f721
source: sources/15-RULE-REGISTRY.md
---
| `VAL-13` | C | all | VAL | Part III.17 | Validation failures map to `invalid_input` with field, code, and English message. | V3 test. | cargo test + docgen --check validation |

---
type: Rule
id: VAL-20
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ccfaff2acbc537f05f405e9b8a151316f07de575e96c210003e4b82444417a47
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `VAL-20` | G | all | VAL | Part III.17 | Generation is deterministic for the same descriptor set and version. | V3 digest test. | cargo test + docgen --check validation |
